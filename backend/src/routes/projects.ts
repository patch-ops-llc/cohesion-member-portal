import { Router } from 'express';
import { z } from 'zod';
import * as hubspot from '../services/hubspot';
import { AppError } from '../middleware/errorHandler';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { mergeDocumentData, getNormalizedStage } from '../utils/documentData';
import { modifiedFieldsSchema } from '../utils/validation';
import prisma from '../db/client';

const router = Router();

// GET /api/projects - Get all projects for authenticated user
router.get('/', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const email = req.user!.email;
    const normalizedEmail = email.toLowerCase().trim();

    const projects = await hubspot.getProjectsByEmail(normalizedEmail);

    const transformedProjects = projects.map(project => {
      const documentData = hubspot.parseDocumentData(project.properties.document_data);
      const stage = getNormalizedStage(project.properties.hs_pipeline_stage);

      return {
        id: project.id,
        name: project.properties.client_project_name,
        email: project.properties.email,
        stage,
        documentData
      };
    });

    logger.info('Projects lookup', { email: normalizedEmail, count: transformedProjects.length });

    res.json({
      success: true,
      email: normalizedEmail,
      projects: transformedProjects
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/:id - Get single project (requires auth)
router.get('/:id', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const normalizedEmail = req.user!.email.toLowerCase().trim();
    const project = await hubspot.getProject(id);

    // Verify user has access to this project
    if (project.properties.email?.toLowerCase().trim() !== normalizedEmail) {
      throw new AppError('Access denied', 403);
    }

    const documentData = hubspot.parseDocumentData(project.properties.document_data);
    const stage = getNormalizedStage(project.properties.hs_pipeline_stage);

    // Get file uploads for this project
    const fileUploads = await prisma.fileUpload.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' }
    });

    logger.info('Project fetched', { projectId: id, email: normalizedEmail });

    res.json({
      success: true,
      project: {
        id: project.id,
        name: project.properties.client_project_name,
        email: project.properties.email,
        stage,
        fileDirectory: project.properties.file_directory
      },
      documentData,
      files: fileUploads
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/projects/:id/document-data - Update document data with merge
router.patch('/:id/document-data', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const normalizedEmail = req.user!.email.toLowerCase().trim();
    
    // Validate request body
    const schema = z.object({
      documentData: z.record(z.unknown()),
      modifiedFields: modifiedFieldsSchema
    });

    const { documentData, modifiedFields } = schema.parse(req.body);

    // Get current project and verify access
    const project = await hubspot.getProject(id);
    if (project.properties.email?.toLowerCase().trim() !== normalizedEmail) {
      throw new AppError('Access denied', 403);
    }

    // Get latest HubSpot data
    const hubspotData = hubspot.parseDocumentData(project.properties.document_data);

    // Merge changes
    const mergedData = mergeDocumentData(
      hubspotData,
      documentData as hubspot.DocumentData,
      modifiedFields
    );

    // Save to HubSpot
    await hubspot.updateDocumentData(id, mergedData);

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'update_document_data',
        entityType: 'project',
        entityId: id,
        userEmail: normalizedEmail,
        userType: 'client',
        details: { modifiedFields },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Document data updated', { projectId: id, email: normalizedEmail });

    res.json({
      success: true,
      mergedData
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request data', 400));
    } else {
      next(error);
    }
  }
});

export default router;
