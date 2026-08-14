import prisma from '../db/client';
import * as hubspot from '../services/hubspot';
import { mergeDocumentData, ModifiedFields } from './documentData';
import { logger } from '../utils/logger';

export type DocumentStatus =
  | 'not_submitted'
  | 'pending_review'
  | 'needs_resubmission'
  | 'missing_files'
  | 'accepted';

export type FileReviewStatus = 'pending_review' | 'accepted' | 'needs_resubmission';

/**
 * Derive a document item's status from the files attached to it.
 *
 * With many files per item, the single status in document_data becomes a
 * roll-up. Order matters: anything a client must act on outranks everything
 * else, so a mixed set of accepted + rejected files still reads as "action
 * needed" rather than being masked by the accepted ones.
 */
export function rollUpStatus(
  files: { status: string }[],
  currentStatus: DocumentStatus
): DocumentStatus {
  if (files.length === 0) {
    // No files left. Preserve an explicit staff signal — a staff member who
    // marked an item "missing files" hasn't had that answered by the client
    // deleting their upload, so don't quietly reset it to untouched.
    return currentStatus === 'missing_files' || currentStatus === 'needs_resubmission'
      ? currentStatus
      : 'not_submitted';
  }

  if (files.some(f => f.status === 'needs_resubmission')) return 'needs_resubmission';
  if (files.every(f => f.status === 'accepted')) return 'accepted';
  return 'pending_review';
}

// Files for one document item, oldest first.
export async function getFilesForDocument(
  projectId: string,
  categoryKey: string,
  documentIndex: number | null
) {
  return prisma.fileUpload.findMany({
    where: { projectId, categoryKey, documentIndex },
    orderBy: { createdAt: 'asc' }
  });
}

/**
 * Recompute a document item's status from its files and write it to HubSpot.
 *
 * Goes through mergeDocumentData against freshly fetched data so a concurrent
 * edit from staff (in the CRM card or the admin UI) isn't clobbered — only the
 * one status we own is overwritten.
 */
export async function syncDocumentStatusFromFiles(
  projectId: string,
  categoryKey: string,
  documentIndex: number | null
): Promise<DocumentStatus | null> {
  if (documentIndex === null || Number.isNaN(documentIndex)) return null;

  const files = await getFilesForDocument(projectId, categoryKey, documentIndex);

  const project = await hubspot.getProject(projectId);
  const hubspotData = hubspot.parseDocumentData(project.properties.document_data);

  const category = hubspotData[categoryKey] as hubspot.CategoryData | undefined;
  const document = category?.documents?.[documentIndex];
  if (!category || !document) {
    logger.warn('Cannot sync status: document not found in document_data', {
      projectId,
      categoryKey,
      documentIndex
    });
    return null;
  }

  const currentStatus = document.status as DocumentStatus;
  const nextStatus = rollUpStatus(files, currentStatus);
  if (nextStatus === currentStatus) return currentStatus;

  // Local copy carrying only the status change we intend to make.
  const localData: hubspot.DocumentData = JSON.parse(JSON.stringify(hubspotData));
  (localData[categoryKey] as hubspot.CategoryData).documents[documentIndex].status = nextStatus;

  const modifiedFields: ModifiedFields = {
    sections: false,
    categories: {},
    documents: {},
    statuses: { [categoryKey]: { [documentIndex]: true } }
  };

  const merged = mergeDocumentData(hubspotData, localData, modifiedFields);
  await hubspot.updateDocumentData(projectId, merged);

  logger.info('Document status rolled up from files', {
    projectId,
    categoryKey,
    documentIndex,
    fileCount: files.length,
    from: currentStatus,
    to: nextStatus
  });

  return nextStatus;
}
