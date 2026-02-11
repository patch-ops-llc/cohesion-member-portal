import { Router } from 'express';
import { z } from 'zod';
import * as hubspot from '../services/hubspot';
import { adminMiddleware } from '../middleware/admin';
import { AppError } from '../middleware/errorHandler';
import { documentStatusSchema } from '../utils/validation';
import { logger } from '../utils/logger';
import prisma from '../db/client';

const router = Router();

// All admin routes require admin authentication
router.use(adminMiddleware);

// GET /api/admin/projects - List all projects with search/filter
router.get('/projects', async (req, res, next) => {
  try {
    const { search, limit = '20' } = req.query;
    const limitNum = Math.min(parseInt(limit as string), 100);

    // Get all projects from HubSpot
    const result = await hubspot.getAllProjects(limitNum);
    
    let projects = result.projects;

    // Apply search filter if provided
    if (search && typeof search === 'string') {
      const searchLower = search.toLowerCase();
      projects = projects.filter(p => 
        p.properties.client_project_name?.toLowerCase().includes(searchLower) ||
        p.properties.email?.toLowerCase().includes(searchLower)
      );
    }

    // Transform for frontend
    const transformedProjects = projects.map(project => {
      const documentData = hubspot.parseDocumentData(project.properties.document_data);
      
      // Calculate document stats
      let totalDocs = 0;
      let pendingDocs = 0;
      let acceptedDocs = 0;

      for (const key of Object.keys(documentData)) {
        if (key === '_meta') continue;
        const category = documentData[key] as hubspot.CategoryData;
        if (category.documents) {
          totalDocs += category.documents.length;
          pendingDocs += category.documents.filter(d => d.status === 'pending_review').length;
          acceptedDocs += category.documents.filter(d => d.status === 'accepted').length;
        }
      }

      return {
        id: project.id,
        name: project.properties.client_project_name,
        email: project.properties.email,
        pipelineStage: project.properties.hs_pipeline_stage,
        stats: { totalDocs, pendingDocs, acceptedDocs }
      };
    });

    logger.info('Admin projects fetched', { count: transformedProjects.length });

    res.json({
      success: true,
      projects: transformedProjects,
      total: transformedProjects.length,
      hasMore: !!result.paging?.next?.after
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/projects/:id - Get project details for admin
router.get('/projects/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await hubspot.getProject(id);
    const documentData = hubspot.parseDocumentData(project.properties.document_data);

    // Get file uploads
    const fileUploads = await prisma.fileUpload.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' }
    });

    // Get audit log
    const auditLog = await prisma.auditLog.findMany({
      where: { entityId: id, entityType: 'project' },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    logger.info('Admin project detail fetched', { projectId: id });

    res.json({
      success: true,
      project: {
        id: project.id,
        name: project.properties.client_project_name,
        email: project.properties.email,
        pipelineStage: project.properties.hs_pipeline_stage,
        fileDirectory: project.properties.file_directory
      },
      documentData,
      files: fileUploads,
      auditLog
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/projects/:id/document-data - Admin update document data
router.patch('/projects/:id/document-data', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { documentData } = req.body;

    if (!documentData) {
      throw new AppError('Document data is required', 400);
    }

    // Save directly to HubSpot (admin can overwrite)
    await hubspot.updateDocumentData(id, documentData);

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'admin_update_document_data',
        entityType: 'project',
        entityId: id,
        userEmail: 'admin',
        userType: 'admin',
        details: { documentData },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin updated document data', { projectId: id });

    res.json({
      success: true,
      documentData
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/projects/:id/document/:categoryKey/:docIndex/status
router.patch('/projects/:id/document/:categoryKey/:docIndex/status', async (req, res, next) => {
  try {
    const { id, categoryKey, docIndex } = req.params;
    const statusSchema = z.object({
      status: documentStatusSchema
    });

    const { status } = statusSchema.parse(req.body);
    const docIndexNum = parseInt(docIndex);

    // Get current document data
    const project = await hubspot.getProject(id);
    const documentData = hubspot.parseDocumentData(project.properties.document_data);

    // Update status
    const category = documentData[categoryKey] as hubspot.CategoryData;
    if (!category || !category.documents || !category.documents[docIndexNum]) {
      throw new AppError('Document not found', 404);
    }

    const previousStatus = category.documents[docIndexNum].status;
    category.documents[docIndexNum].status = status;

    // Save to HubSpot
    await hubspot.updateDocumentData(id, documentData);

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'admin_update_document_status',
        entityType: 'document',
        entityId: `${id}/${categoryKey}/${docIndex}`,
        userEmail: 'admin',
        userType: 'admin',
        details: { previousStatus, newStatus: status, categoryKey, docIndex: docIndexNum },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin updated document status', { projectId: id, categoryKey, docIndex: docIndexNum, status });

    res.json({
      success: true,
      status
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid status', 400));
    } else {
      next(error);
    }
  }
});

// GET /api/admin/audit-log - Get audit log entries
router.get('/audit-log', async (req, res, next) => {
  try {
    const { projectId, action, limit = '100' } = req.query;
    const limitNum = Math.min(parseInt(limit as string), 500);

    const where: Record<string, unknown> = {};
    if (projectId) where.entityId = projectId;
    if (action) where.action = action;

    const entries = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limitNum
    });

    res.json({
      success: true,
      entries
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/stats - Dashboard statistics
router.get('/stats', async (req, res, next) => {
  try {
    const result = await hubspot.getAllProjects(100);
    
    let totalProjects = result.projects.length;
    let pendingReviewCount = 0;
    let activeProjects = 0;

    for (const project of result.projects) {
      const documentData = hubspot.parseDocumentData(project.properties.document_data);
      let hasActive = false;

      for (const key of Object.keys(documentData)) {
        if (key === '_meta') continue;
        const category = documentData[key] as hubspot.CategoryData;
        if (category.status === 'active') hasActive = true;
        if (category.documents) {
          for (const doc of category.documents) {
            if (doc.status === 'pending_review') {
              pendingReviewCount++;
            }
          }
        }
      }

      if (hasActive) activeProjects++;
    }

    // Get recent file uploads count
    const recentUploads = await prisma.fileUpload.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    });

    res.json({
      success: true,
      stats: {
        totalProjects,
        activeProjects,
        pendingReviewCount,
        recentUploads
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
