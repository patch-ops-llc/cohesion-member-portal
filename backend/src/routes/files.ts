import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as hubspot from '../services/hubspot';
import * as storage from '../services/storage';
import { authMiddleware } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateFile, allowedMimeTypes, maxFileSize } from '../utils/validation';
import { logger } from '../utils/logger';
import prisma from '../db/client';

const router = Router();

// Configure multer
const upload = multer({
  dest: path.join(process.cwd(), 'tmp/uploads'),
  limits: { fileSize: maxFileSize },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

// Ensure temp directory exists
const tmpDir = path.join(process.cwd(), 'tmp/uploads');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// POST /api/files/:projectId/upload - Upload file for a project
router.post('/:projectId/upload', authMiddleware, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { projectId } = req.params;
    const { categoryKey, documentIndex } = req.body;
    const file = req.file;

    if (!file) {
      throw new AppError('No file uploaded', 400);
    }

    if (!categoryKey) {
      throw new AppError('Category key is required', 400);
    }

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      // Clean up temp file
      fs.unlinkSync(file.path);
      throw new AppError(validation.error || 'Invalid file', 400);
    }

    // Get project and verify access
    const project = await hubspot.getProject(projectId);
    if (project.properties.email?.toLowerCase().trim() !== req.user.email.toLowerCase().trim()) {
      fs.unlinkSync(file.path);
      throw new AppError('Access denied', 403);
    }

    // 1. Save to local storage (backup)
    const storedPath = await storage.saveFile(file.path, file.originalname, projectId);

    // 2. Get or create HubSpot folder
    const folderId = await hubspot.getOrCreateProjectFolder(
      projectId,
      project.properties.client_project_name,
      project.properties.email
    );

    // 3. Upload to HubSpot File Manager
    const hubspotFileId = await hubspot.uploadFileToHubSpot(
      storedPath,
      file.originalname,
      folderId
    );

    // 4. Create note with attachment
    const noteId = await hubspot.createNoteWithAttachment(
      projectId,
      hubspotFileId,
      `File uploaded via customer portal: ${file.originalname} (Category: ${categoryKey})`
    );

    // 5. Update document_data status to pending_review
    const documentData = hubspot.parseDocumentData(project.properties.document_data);
    const docIndex = parseInt(documentIndex);
    
    if (documentData[categoryKey] && 
        typeof documentData[categoryKey] !== 'object' || 
        !('selectedSections' in (documentData[categoryKey] as object))) {
      const category = documentData[categoryKey] as hubspot.CategoryData;
      if (category.documents && !isNaN(docIndex) && category.documents[docIndex]) {
        category.documents[docIndex].status = 'pending_review';
        await hubspot.updateDocumentData(projectId, documentData);
      }
    }

    // 6. Log to database
    const fileUpload = await prisma.fileUpload.create({
      data: {
        projectId,
        categoryKey,
        documentIndex: !isNaN(docIndex) ? docIndex : null,
        originalFilename: file.originalname,
        storedFilename: path.basename(storedPath),
        storagePath: storedPath,
        hubspotFileId,
        hubspotNoteId: noteId,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById: req.user.userId,
        status: 'pending_review'
      }
    });

    // 7. Audit log
    await prisma.auditLog.create({
      data: {
        action: 'file_upload',
        entityType: 'file',
        entityId: fileUpload.id,
        userId: req.user.userId,
        userType: 'client',
        details: {
          projectId,
          categoryKey,
          documentIndex: docIndex,
          filename: file.originalname,
          hubspotFileId
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('File uploaded successfully', {
      projectId,
      fileId: fileUpload.id,
      hubspotFileId,
      userId: req.user.userId
    });

    res.json({
      success: true,
      fileId: hubspotFileId,
      noteId,
      uploadId: fileUpload.id
    });
  } catch (error) {
    // Clean up temp file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
});

// GET /api/files/:id - Get file info
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    const fileUpload = await prisma.fileUpload.findUnique({
      where: { id }
    });

    if (!fileUpload) {
      throw new AppError('File not found', 404);
    }

    // Verify user has access to this project
    const project = await hubspot.getProject(fileUpload.projectId);
    if (project.properties.email?.toLowerCase().trim() !== req.user.email.toLowerCase().trim()) {
      throw new AppError('Access denied', 403);
    }

    res.json({
      success: true,
      file: fileUpload
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/files/:id/download - Download file
router.get('/:id/download', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    const fileUpload = await prisma.fileUpload.findUnique({
      where: { id }
    });

    if (!fileUpload) {
      throw new AppError('File not found', 404);
    }

    // Verify user has access to this project
    const project = await hubspot.getProject(fileUpload.projectId);
    if (project.properties.email?.toLowerCase().trim() !== req.user.email.toLowerCase().trim()) {
      throw new AppError('Access denied', 403);
    }

    if (!fileUpload.storagePath || !storage.fileExists(fileUpload.storagePath)) {
      throw new AppError('File not found on disk', 404);
    }

    res.download(fileUpload.storagePath, fileUpload.originalFilename);
  } catch (error) {
    next(error);
  }
});

export default router;
