import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import * as hubspot from '../services/hubspot';
import * as storage from '../services/storage';
import * as bucket from '../services/bucket';
import { stageUpload, processSubmission } from '../services/fileIngest';
import { syncDocumentStatusFromFiles } from '../utils/fileStatus';
import { AppError } from '../middleware/errorHandler';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { validateFile, maxFileSize, maxFilesPerUpload } from '../utils/validation';
import { signDownloadToken, verifyDownloadToken } from '../utils/downloadToken';
import { streamFileForDownload } from '../services/fileDownload';
import { logger } from '../utils/logger';
import prisma from '../db/client';

const router = Router();

// Multer's temp directory is a transient buffer inside a single request only.
// Durability comes from the bucket: nothing is acknowledged to the client until
// the object is stored there, so the container filesystem being ephemeral is
// fine — a container death mid-request is a visible failure, not silent loss.
const tmpDir = path.join(os.tmpdir(), 'cohesion-uploads');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

// Multer writes to disk (never memory) so a large file doesn't sit in the heap.
//
// Deliberately no fileFilter: rejecting there aborts the entire request, so one
// wrong-typed file in a batch of ten would fail the other nine. Type checking
// happens per file in the handler instead, which lets good files through and
// reports each rejection against its own filename. The size limit stays on
// multer because that one must stop bytes from being written at all.
const upload = multer({
  // diskStorage rather than `dest` so the staged file keeps its extension.
  // multer's default naming strips it, which makes anything sitting in staging
  // unidentifiable and previously leaked into HubSpot as an extensionless file.
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tmpDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 12);
      cb(null, `${randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: maxFileSize, files: maxFilesPerUpload }
});

// Shape returned to the UI for a single stored file.
function toFileDto(f: {
  id: string; categoryKey: string; documentIndex: number | null;
  originalFilename: string; fileSize: number | null; mimeType: string | null;
  uploadedByEmail: string | null; status: string; createdAt: Date;
  hubspotFileId: string | null; storagePath: string | null;
}) {
  return {
    id: f.id,
    categoryKey: f.categoryKey,
    documentIndex: f.documentIndex,
    filename: f.originalFilename,
    size: f.fileSize,
    mimeType: f.mimeType,
    uploadedByEmail: f.uploadedByEmail,
    status: f.status,
    uploadedAt: f.createdAt,
    // A staged file is a complete submission even before HubSpot has it, so it
    // must be retrievable from the volume. Gating downloads on the HubSpot copy
    // would hide a client's own file from them until the handoff finished.
    canDownload: Boolean(f.hubspotFileId || f.storagePath)
  };
}

async function assertProjectAccess(req: AuthRequest, projectId: string): Promise<string> {
  const normalizedEmail = req.user!.email.toLowerCase().trim();
  const contactId = req.user!.hubspotContactId ?? null;
  const hasAccess = await hubspot.userHasProjectAccess(projectId, normalizedEmail, contactId);
  if (!hasAccess) {
    throw new AppError('Access denied', 403);
  }
  return normalizedEmail;
}

// POST /api/files/:projectId/upload
// Accepts `files` (many) and stays backward compatible with a single `file`.
// Each file succeeds or fails independently, so one bad file in a batch of ten
// doesn't sink the other nine.
router.post(
  '/:projectId/upload',
  authMiddleware,
  upload.fields([{ name: 'files', maxCount: maxFilesPerUpload }, { name: 'file', maxCount: 1 }]),
  async (req: AuthRequest, res, next) => {
    const grouped = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const files = [...(grouped.files || []), ...(grouped.file || [])];

    try {
      const { projectId } = req.params;
      const { categoryKey } = req.body;

      if (files.length === 0) throw new AppError('No file uploaded', 400);
      if (!categoryKey) throw new AppError('Category key is required', 400);

      const parsedIndex = parseInt(req.body.documentIndex, 10);
      const documentIndex = Number.isNaN(parsedIndex) ? null : parsedIndex;

      const normalizedEmail = await assertProjectAccess(req, projectId);

      const staged: { uploadId: string; filename: string }[] = [];
      const failed: { filename: string; error: string }[] = [];

      for (const file of files) {
        const validation = validateFile(file);
        if (!validation.valid) {
          await storage.removeTempFile(file.path);
          failed.push({ filename: file.originalname, error: validation.error! });
          continue;
        }

        try {
          // Store in the bucket before answering. Once this resolves the
          // submission is durable and independent of this container.
          const objectKey = bucket.buildObjectKey(projectId, file.originalname);
          await bucket.putFile(objectKey, file.path, file.mimetype);
          await storage.removeTempFile(file.path);

          const result = await stageUpload({
            projectId,
            storagePath: objectKey,
            storedFilename: path.basename(objectKey),
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            categoryKey,
            documentIndex,
            uploadedByEmail: normalizedEmail
          });
          staged.push(result);

          await prisma.auditLog.create({
            data: {
              action: 'file_upload',
              entityType: 'file',
              entityId: result.uploadId,
              userEmail: normalizedEmail,
              userType: 'client',
              details: { projectId, categoryKey, documentIndex, filename: result.filename },
              ipAddress: req.ip,
              userAgent: req.get('user-agent')
            }
          });
        } catch (error) {
          logger.error('Failed to store uploaded file in bucket', {
            projectId,
            filename: file.originalname,
            error: String(error)
          });
          await storage.removeTempFile(file.path);
          failed.push({
            filename: file.originalname,
            error: 'Upload could not be saved. Please try again.'
          });
        }
      }

      logger.info('Upload batch staged', {
        projectId,
        staged: staged.length,
        failed: failed.length,
        email: normalizedEmail
      });

      // Answer the client now. The file is on the persistent volume and has a
      // database row, so the submission survives a restart from this point on.
      // 207 when a batch partially failed, so the UI can surface per-file errors
      // without treating the whole submission as lost.
      res.status(failed.length > 0 && staged.length > 0 ? 207 : 200).json({
        success: staged.length > 0,
        uploaded: staged,
        failed
      });

      // Everything HubSpot-related happens after the response: push each file,
      // reconcile the document status, then send one email listing the batch.
      if (staged.length > 0) {
        processSubmission({
          uploadIds: staged.map(s => s.uploadId),
          projectId,
          categoryKey,
          documentIndex,
          uploadedByEmail: normalizedEmail
        }).catch(err =>
          logger.error('Background submission processing failed', {
            projectId,
            error: String(err)
          })
        );
      }
    } catch (error) {
      await Promise.all(files.map(f => storage.removeTempFile(f.path)));
      next(error);
    }
  }
);

// GET /api/files/project/:projectId
// Every file for a project in one call, so a checklist with 20 documents
// doesn't fire 20 requests.
router.get('/project/:projectId', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(req, projectId);

    const files = await prisma.fileUpload.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }
    });

    res.json({ success: true, files: files.map(toFileDto) });
  } catch (error) {
    next(error);
  }
});

// GET /api/files/:id/download - resolve the HubSpot-hosted URL.
//
// Returns JSON rather than redirecting: the browser can only follow a redirect
// via a plain navigation, and a navigation cannot carry the Authorization
// header, so a redirect endpoint behind authMiddleware is unreachable from an
// <a href>. The client fetches this with its token, then opens the URL.
router.get('/:id/download', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const record = await prisma.fileUpload.findUnique({ where: { id: req.params.id } });
    if (!record) throw new AppError('File not found', 404);

    await assertProjectAccess(req, record.projectId);

    if (!record.hubspotFileId && !record.storagePath) {
      throw new AppError('No copy of this file is currently available.', 404);
    }

    // Always hand back our own streaming URL rather than the HubSpot one. Going
    // through the app is what lets the response carry Content-Disposition, so
    // the browser saves the file under its real name instead of opening it in a
    // tab — and the same link works whether the file is still staged or already
    // filed in HubSpot.
    res.json({
      success: true,
      url: `/api/files/${record.id}/raw?t=${encodeURIComponent(signDownloadToken(record.id))}`,
      filename: record.originalFilename
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/files/:id/raw?t=... - stream the staged copy off the volume.
// Deliberately not behind authMiddleware: it is reached by a browser
// navigation. The token is minted above for one file id and expires in a
// minute, so it grants nothing else.
router.get('/:id/raw', async (req, res, next) => {
  try {
    const fileId = verifyDownloadToken(String(req.query.t || ''));
    if (!fileId || fileId !== req.params.id) {
      throw new AppError('This download link has expired. Please try again.', 401);
    }

    const record = await prisma.fileUpload.findUnique({ where: { id: req.params.id } });
    if (!record) throw new AppError('File not found', 404);

    await streamFileForDownload(record, res);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/files/:id
// Clients may remove or replace a file only while it is still awaiting review —
// once staff have accepted it, it is part of the record.
router.delete('/:id', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const record = await prisma.fileUpload.findUnique({ where: { id } });
    if (!record) throw new AppError('File not found', 404);

    const normalizedEmail = await assertProjectAccess(req, record.projectId);

    if (record.status === 'accepted') {
      throw new AppError('This file has already been accepted and can no longer be removed.', 409);
    }

    // Claim the row away from the background pusher before deleting anything.
    // Deleting mid-push would let the push finish against a row that no longer
    // exists, leaving an orphaned file and note in HubSpot that nothing knows
    // about. 'transferring' means a push is in flight, so ask them to retry.
    const claimed = await prisma.fileUpload.updateMany({
      where: { id, transferStatus: { in: ['pending', 'failed', 'synced'] } },
      data: { transferStatus: 'deleting' }
    });
    if (claimed.count === 0) {
      throw new AppError('This file is being filed right now. Please try again in a moment.', 409);
    }

    await prisma.fileUpload.delete({ where: { id } });

    if (record.hubspotFileId) await hubspot.deleteFileFromHubSpot(record.hubspotFileId);
    // Object key, not a local path — this must go to the bucket.
    if (record.storagePath) await bucket.deleteObject(record.storagePath);

    const status = await syncDocumentStatusFromFiles(
      record.projectId, record.categoryKey, record.documentIndex
    );

    // audit_log is the durable record of the removal, which is why the row
    // itself can be deleted outright rather than soft-deleted.
    await prisma.auditLog.create({
      data: {
        action: 'file_delete',
        entityType: 'file',
        entityId: id,
        userEmail: normalizedEmail,
        userType: 'client',
        details: {
          projectId: record.projectId,
          categoryKey: record.categoryKey,
          documentIndex: record.documentIndex,
          filename: record.originalFilename
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('File removed by client', { fileId: id, email: normalizedEmail });

    res.json({ success: true, documentStatus: status });
  } catch (error) {
    next(error);
  }
});

// GET /api/files/:id - file metadata
router.get('/:id', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const fileUpload = await prisma.fileUpload.findUnique({ where: { id: req.params.id } });
    if (!fileUpload) throw new AppError('File not found', 404);

    await assertProjectAccess(req, fileUpload.projectId);

    res.json({ success: true, file: toFileDto(fileUpload) });
  } catch (error) {
    next(error);
  }
});

export default router;
