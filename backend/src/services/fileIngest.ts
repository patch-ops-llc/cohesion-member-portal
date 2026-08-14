import fs from 'fs';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import * as hubspot from '../services/hubspot';
import * as storage from '../services/storage';
import * as bucket from '../services/bucket';
import * as emailService from '../services/email';
import { syncDocumentStatusFromFiles } from '../utils/fileStatus';
import { logger } from '../utils/logger';
import prisma from '../db/client';

const MAX_TRANSFER_ATTEMPTS = 5;

export interface StagedFile {
  uploadId: string;
  filename: string;
}

/**
 * Record a file that multer has written to the persistent volume.
 *
 * This is the whole of the client's request: once the bytes are on the volume
 * and this row exists, the submission is durable and the client is told it
 * succeeded. Everything HubSpot-related happens afterwards, so a slow or
 * unavailable HubSpot never holds up (or fails) a client's upload.
 */
export async function stageUpload(params: {
  projectId: string;
  storagePath: string;
  storedFilename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  categoryKey: string;
  documentIndex: number | null;
  uploadedByEmail: string;
}): Promise<StagedFile> {
  const record = await prisma.fileUpload.create({
    data: {
      projectId: params.projectId,
      categoryKey: params.categoryKey,
      documentIndex: params.documentIndex,
      originalFilename: params.originalFilename,
      storedFilename: params.storedFilename,
      storagePath: params.storagePath,
      fileSize: params.size,
      mimeType: params.mimeType,
      uploadedByEmail: params.uploadedByEmail,
      status: 'pending_review',
      transferStatus: 'pending'
    }
  });

  return { uploadId: record.id, filename: params.originalFilename };
}

/**
 * Push one staged file to HubSpot: File Manager -> Note -> association.
 *
 * Claims the row before doing any work. Without the claim, the retry sweep
 * could pick up a transfer that is merely slow rather than abandoned and upload
 * the same file twice, leaving a duplicate file and a duplicate note on the
 * project with nothing to detect it.
 */
export async function pushToHubSpot(uploadId: string): Promise<boolean> {
  const claimed = await prisma.fileUpload.updateMany({
    where: { id: uploadId, transferStatus: { in: ['pending', 'failed'] } },
    data: { transferStatus: 'transferring', transferAttempts: { increment: 1 } }
  });

  // Zero rows updated: already synced, or another worker has it.
  if (claimed.count === 0) return false;

  const record = await prisma.fileUpload.findUnique({ where: { id: uploadId } });
  if (!record || !record.storagePath) {
    await prisma.fileUpload.update({
      where: { id: uploadId },
      data: { transferStatus: 'failed', transferError: 'Staged file is missing' }
    });
    return false;
  }

  // HubSpot's upload endpoint needs a known content length, so the staged
  // object is pulled to a temp file first rather than piped straight through.
  const tempPath = path.join(
    os.tmpdir(),
    `cohesion-${record.id}${path.extname(record.originalFilename).slice(0, 12)}`
  );

  try {
    const body = await bucket.getObjectStream(record.storagePath);
    await pipeline(body, fs.createWriteStream(tempPath));

    const project = await hubspot.getProject(record.projectId);

    const folderId = await hubspot.getOrCreateProjectFolder(
      record.projectId,
      project.properties.client_project_name,
      project.properties.email
    );

    const hubspotFileId = await hubspot.uploadFileToHubSpot(
      tempPath,
      record.originalFilename,
      folderId,
      record.mimeType ?? undefined
    );

    const hubspotNoteId = await hubspot.createNoteWithAttachment(
      record.projectId,
      hubspotFileId,
      `File uploaded via customer portal: ${record.originalFilename} (Category: ${record.categoryKey})`
    );

    await prisma.fileUpload.update({
      where: { id: uploadId },
      data: {
        hubspotFileId,
        hubspotNoteId,
        transferStatus: 'synced',
        transferError: null
      }
    });

    // The bucket copy is deliberately kept. HubSpot would otherwise be the only
    // place a client's tax document exists, and a deletion there — accidental
    // or otherwise — would be unrecoverable. Storage is ~$0.015/GB-month, which
    // is a negligible price for not depending on a third party for the only
    // copy. It also means downloads serve from the bucket rather than costing a
    // HubSpot API call.

    logger.info('Staged file synced to HubSpot', { uploadId, hubspotFileId });
    return true;
  } catch (error) {
    await prisma.fileUpload.update({
      where: { id: uploadId },
      data: {
        transferStatus: 'failed',
        transferError: String(error).slice(0, 500)
      }
    });
    logger.error('Failed to sync staged file to HubSpot', { uploadId, error: String(error) });
    return false;
  } finally {
    await storage.removeTempFile(tempPath);
  }
}

/**
 * Background work for one submission: push every staged file, then reconcile
 * the document's status and notify. Runs after the client has been answered.
 */
export async function processSubmission(params: {
  uploadIds: string[];
  projectId: string;
  categoryKey: string;
  documentIndex: number | null;
  uploadedByEmail: string;
}): Promise<void> {
  const { uploadIds, projectId, categoryKey, documentIndex, uploadedByEmail } = params;

  const synced: string[] = [];
  for (const uploadId of uploadIds) {
    const ok = await pushToHubSpot(uploadId);
    if (ok) {
      const record = await prisma.fileUpload.findUnique({ where: { id: uploadId } });
      if (record) synced.push(record.originalFilename);
    }
  }

  try {
    await syncDocumentStatusFromFiles(projectId, categoryKey, documentIndex);
  } catch (error) {
    logger.error('Failed to roll up document status', { projectId, error: String(error) });
  }

  if (synced.length > 0) {
    await sendSubmissionEmails({
      projectId, uploadedByEmail, categoryKey, documentIndex, filenames: synced
    });
  }
}

// One email per submission listing every file, rather than one per file.
async function sendSubmissionEmails(params: {
  projectId: string;
  uploadedByEmail: string;
  categoryKey: string;
  documentIndex: number | null;
  filenames: string[];
}) {
  const { projectId, uploadedByEmail, categoryKey, documentIndex, filenames } = params;

  try {
    const project = await hubspot.getProject(projectId);
    const documentData = hubspot.parseDocumentData(project.properties.document_data);
    const categoryData = documentData[categoryKey] as hubspot.CategoryData | undefined;
    const categoryLabel = categoryData?.label || categoryKey;
    const documentName =
      (documentIndex !== null && categoryData?.documents?.[documentIndex]?.name) || filenames[0];
    const projectName = project.properties.client_project_name || 'Project';

    const contact = await hubspot.findContactByEmail(uploadedByEmail);
    const displayName =
      [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || uploadedByEmail;

    const ccAddrs = project.properties.cc_email?.trim()
      ? project.properties.cc_email
          .split(/[,;]\s*/)
          .map(e => e.trim().toLowerCase())
          .filter(e => e && e !== uploadedByEmail)
      : [];

    await emailService.sendDocumentSubmissionEmail(
      uploadedByEmail, displayName, projectName, categoryLabel, documentName, filenames, ccAddrs
    );

    await emailService.sendAdminDocumentSubmissionNotification(
      uploadedByEmail, displayName, projectName, projectId, categoryLabel, documentName, filenames
    );
  } catch (error) {
    logger.error('Failed to send submission emails', { projectId, error: String(error) });
  }
}

/**
 * Retry files that are staged but not yet in HubSpot.
 *
 * Covers two cases: a transfer that failed (HubSpot down, token expired), and
 * one stranded by a restart — the container was replaced mid-push, so the
 * in-process job died while the file sat safely on the volume. 'transferring'
 * rows older than the stale window are treated as abandoned.
 */
export async function retryPendingTransfers(staleMinutes = 15): Promise<number> {
  const staleBefore = new Date(Date.now() - staleMinutes * 60 * 1000);

  const stranded = await prisma.fileUpload.findMany({
    where: {
      transferAttempts: { lt: MAX_TRANSFER_ATTEMPTS },
      storagePath: { not: null },
      OR: [
        { transferStatus: { in: ['pending', 'failed'] } },
        { transferStatus: 'transferring', createdAt: { lt: staleBefore } }
      ]
    },
    take: 25,
    orderBy: { createdAt: 'asc' }
  });

  if (stranded.length === 0) return 0;

  logger.info('Retrying staged files not yet in HubSpot', { count: stranded.length });

  for (const record of stranded) {
    // Reset an abandoned claim so pushToHubSpot can take it again.
    if (record.transferStatus === 'transferring') {
      await prisma.fileUpload.update({
        where: { id: record.id },
        data: { transferStatus: 'failed', transferError: 'Abandoned mid-transfer; retrying' }
      });
    }
    await pushToHubSpot(record.id);
    try {
      await syncDocumentStatusFromFiles(record.projectId, record.categoryKey, record.documentIndex);
    } catch {
      // Status reconciles on the next sweep; the file itself is what matters.
    }
  }

  return stranded.length;
}

export { syncDocumentStatusFromFiles };
