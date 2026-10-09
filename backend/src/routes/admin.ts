import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as hubspot from '../services/hubspot';
import * as storage from '../services/storage';
import * as bucket from '../services/bucket';
import * as emailService from '../services/email';
import { pushToHubSpot } from '../services/fileIngest';
import { syncDocumentStatusFromFiles } from '../utils/fileStatus';
import { signDownloadToken } from '../utils/downloadToken';
import {
  runUploadDigest,
  runWeeklyClientDigest,
  runAdminWeeklySummary,
  scheduleClientDigest,
  scheduleUploadDigest
} from '../services/scheduler';
import {
  getWeeklyClientDigestEnabled,
  setWeeklyClientDigestEnabled,
  getWeeklyClientDigestSchedule,
  setWeeklyClientDigestSchedule,
  getUploadDigestSchedule,
  setUploadDigestSchedule,
  getPortalBanner,
  setPortalBanner,
  BANNER_PAGE_OPTIONS,
  ALLOWED_TIMEZONES,
  getTaxSeasonSettings,
  setTaxSeasonSettings,
  getRolloverRun
} from '../services/settings';
import {
  planRollover,
  startRollover,
  getSeasonOverview,
  backfillTaxYears
} from '../services/rollover';
import { MAX_TAX_YEAR, MIN_TAX_YEAR } from '../utils/taxYear';
import { adminMiddleware } from '../middleware/admin';
import { AppError } from '../middleware/errorHandler';
import {
  documentStatusSchema,
  validateFile,
  allowedMimeTypes,
  maxFileSize,
  maxFilesPerUpload
} from '../utils/validation';
import { logger } from '../utils/logger';
import { countClientActionNeeded, isInDocumentCollectionPhase } from '../utils/documentData';
import prisma from '../db/client';

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

const router = Router();

// All admin routes require admin authentication
router.use(adminMiddleware);

// GET /api/admin/projects - List all projects with search/filter
router.get('/projects', async (req, res, next) => {
  try {
    const { search } = req.query;

    const result = await hubspot.getAllProjects();
    
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
        taxYear: hubspot.getProjectTaxYear(project),
        stats: { totalDocs, pendingDocs, acceptedDocs }
      };
    });

    logger.info('Admin projects fetched', { count: transformedProjects.length });

    res.json({
      success: true,
      projects: transformedProjects,
      total: transformedProjects.length,
      hasMore: false
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

    // Get file uploads (live only — soft-deleted rows stay for the audit trail)
    const fileUploads = await prisma.fileUpload.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'asc' }
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
        taxYear: hubspot.getProjectTaxYear(project),
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

// GET /api/admin/verify - Cheap key check for the admin login screen.
// The login form used to validate the key against /stats, which reads HubSpot —
// so any HubSpot outage locked staff out with a misleading "Invalid API key".
// This endpoint touches nothing but the middleware.
router.get('/verify', (req, res) => {
  res.json({ success: true });
});

// GET /api/admin/stats - Dashboard statistics
router.get('/stats', async (req, res, next) => {
  try {
    // DB-backed figures first: these must still render when HubSpot is down.
    const recentUploads = await prisma.fileUpload.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }
    });

    let result;
    try {
      result = await hubspot.getAllProjects();
    } catch (error) {
      // Degrade rather than 500 the whole dashboard when one upstream is down.
      logger.error('Stats: HubSpot unavailable, returning partial stats', { error: String(error) });
      return res.json({
        success: true,
        degraded: true,
        stats: {
          totalProjects: null,
          activeProjects: null,
          pendingReviewCount: null,
          recentUploads
        }
      });
    }

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

// GET /api/admin/contacts/search - Search HubSpot contacts by query
router.get('/contacts/search', async (req, res, next) => {
  try {
    const { q, limit = '10' } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.json({ success: true, contacts: [] });
    }

    const limitNum = Math.min(parseInt(limit as string), 25);
    const contacts = await hubspot.searchContacts(q.trim(), limitNum);

    res.json({
      success: true,
      contacts
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/projects - Create a new project from a HubSpot contact
router.post('/projects', async (req, res, next) => {
  try {
    const schema = z.object({
      contactId: z.string().min(1),
      contactEmail: z.string().email(),
      projectName: z.string().min(1, 'Project name is required').max(200),
      taxYear: z.number().int().min(MIN_TAX_YEAR).max(MAX_TAX_YEAR).nullable().optional()
    });

    const { contactId, contactEmail, projectName, taxYear } = schema.parse(req.body);

    // Default to the configured season. Without this, a name like "John Smith
    // 2025 Tax Return" would be read as last season and hidden from the client
    // the moment it was created.
    const season = await getTaxSeasonSettings();
    const effectiveTaxYear = taxYear ?? season.currentTaxYear;

    const project = await hubspot.createProject({
      client_project_name: projectName,
      email: contactEmail,
      tax_year: effectiveTaxYear
    });

    await hubspot.associateProjectWithContact(project.id, contactId);

    await prisma.auditLog.create({
      data: {
        action: 'admin_create_project',
        entityType: 'project',
        entityId: project.id,
        userEmail: 'admin',
        userType: 'admin',
        details: { contactId, contactEmail, projectName, taxYear: effectiveTaxYear },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin created project', {
      projectId: project.id,
      contactEmail,
      projectName,
      taxYear: effectiveTaxYear
    });

    res.status(201).json({
      success: true,
      project: {
        id: project.id,
        name: projectName,
        email: contactEmail,
        taxYear: effectiveTaxYear
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0]?.message || 'Invalid request', 400));
    } else {
      next(error);
    }
  }
});

// GET /api/admin/projects/:id/contacts - List all contacts associated with a project
router.get('/projects/:id/contacts', async (req, res, next) => {
  try {
    const { id } = req.params;
    const contacts = await hubspot.getAssociatedContacts(id);

    res.json({
      success: true,
      contacts
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/projects/:id/contacts - Associate an additional contact with a project
router.post('/projects/:id/contacts', async (req, res, next) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      contactId: z.string().min(1, 'Contact ID is required')
    });
    const { contactId } = schema.parse(req.body);

    await hubspot.associateProjectWithContact(id, contactId);

    await prisma.auditLog.create({
      data: {
        action: 'admin_add_project_contact',
        entityType: 'project',
        entityId: id,
        userEmail: 'admin',
        userType: 'admin',
        details: { contactId },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin added contact to project', { projectId: id, contactId });

    res.json({
      success: true,
      message: 'Contact associated with project'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0]?.message || 'Invalid request', 400));
    } else {
      next(error);
    }
  }
});

// DELETE /api/admin/projects/:id/contacts/:contactId - Remove a contact association from a project
router.delete('/projects/:id/contacts/:contactId', async (req, res, next) => {
  try {
    const { id, contactId } = req.params;

    await hubspot.removeProjectContactAssociation(id, contactId);

    await prisma.auditLog.create({
      data: {
        action: 'admin_remove_project_contact',
        entityType: 'project',
        entityId: id,
        userEmail: 'admin',
        userType: 'admin',
        details: { contactId },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin removed contact from project', { projectId: id, contactId });

    res.json({
      success: true,
      message: 'Contact removed from project'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/send-registration-invites - Send invite emails to selected project emails
router.post('/send-registration-invites', async (req, res, next) => {
  try {
    const schema = z.object({
      projectIds: z.array(z.string()).min(1, 'At least one project must be selected')
    });
    const { projectIds } = schema.parse(req.body);

    const results: { email: string; projectId?: string; status: 'sent' | 'already_registered' | 'no_email' | 'duplicate_skipped' | 'error'; error?: string }[] = [];
    const emailsAlreadySent = new Set<string>();

    for (const projectId of projectIds) {
      try {
        const project = await hubspot.getProject(projectId);
        const primaryEmail = project.properties.email?.toLowerCase().trim() || '';

        // Build a deduplicated recipient list: primary project email + every
        // associated HubSpot contact. Each recipient must receive their own
        // invite (with their own personalized registration call-to-action),
        // not just a CC on the primary recipient's email.
        const recipientMap = new Map<string, { email: string; displayName: string }>();

        if (primaryEmail) {
          const contact = await hubspot.findContactByEmail(primaryEmail);
          const displayName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || '';
          recipientMap.set(primaryEmail, { email: primaryEmail, displayName });
        }

        const associatedContacts = await hubspot.getAssociatedContacts(projectId);
        for (const c of associatedContacts) {
          const normalized = c.email?.toLowerCase().trim();
          if (!normalized || recipientMap.has(normalized)) continue;
          const displayName = [c.firstName, c.lastName].filter(Boolean).join(' ') || '';
          recipientMap.set(normalized, { email: normalized, displayName });
        }

        if (recipientMap.size === 0) {
          results.push({ email: projectId, projectId, status: 'no_email' });
          continue;
        }

        // Parse the project's cc_email field once. Anyone listed there who is
        // ALSO a recipient is excluded — they'll receive their own TO invite,
        // so we don't want to CC them on someone else's.
        const projectCcAddrs = project.properties.cc_email?.trim()
          ? project.properties.cc_email
              .split(/[,;]\s*/)
              .map(e => e.trim().toLowerCase())
              .filter(Boolean)
          : [];

        for (const { email, displayName } of recipientMap.values()) {
          try {
            if (emailsAlreadySent.has(email)) {
              results.push({ email, projectId, status: 'duplicate_skipped' });
              continue;
            }

            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
              emailsAlreadySent.add(email);
              results.push({ email, projectId, status: 'already_registered' });
              continue;
            }

            const ccAddrs = projectCcAddrs.filter(e => e !== email && !recipientMap.has(e));

            await emailService.sendRegistrationInviteEmail(email, displayName, ccAddrs);
            emailsAlreadySent.add(email);
            results.push({ email, projectId, status: 'sent' });

            logger.info('Registration invite sent', { email, projectId });
          } catch (err) {
            results.push({
              email,
              projectId,
              status: 'error',
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }
      } catch (err) {
        results.push({
          email: projectId,
          projectId,
          status: 'error',
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'admin_send_registration_invites',
        entityType: 'bulk',
        entityId: 'registration_invites',
        userEmail: 'admin',
        userType: 'admin',
        details: { projectIds, results },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    const sentCount = results.filter(r => r.status === 'sent').length;
    const dupCount = results.filter(r => r.status === 'duplicate_skipped').length;
    logger.info('Bulk registration invites completed', { total: projectIds.length, sent: sentCount, duplicatesSkipped: dupCount });

    res.json({
      success: true,
      results,
      summary: {
        total: results.length,
        sent: sentCount,
        alreadyRegistered: results.filter(r => r.status === 'already_registered').length,
        noEmail: results.filter(r => r.status === 'no_email').length,
        duplicateSkipped: dupCount,
        errors: results.filter(r => r.status === 'error').length
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0]?.message || 'Invalid request', 400));
    } else {
      next(error);
    }
  }
});

// POST /api/admin/send-bulk-contact-invites - Bulk send registration invites by email
router.post('/send-bulk-contact-invites', async (req, res, next) => {
  try {
    const schema = z.object({
      emails: z.array(z.string().email()).min(1, 'At least one email must be selected')
    });
    const { emails } = schema.parse(req.body);

    const results: { email: string; status: 'sent' | 'already_registered' | 'duplicate_skipped' | 'error'; error?: string }[] = [];
    const emailsAlreadyProcessed = new Set<string>();

    for (const rawEmail of emails) {
      const normalizedEmail = rawEmail.toLowerCase().trim();

      // Skip if we already processed this email in this batch
      if (emailsAlreadyProcessed.has(normalizedEmail)) {
        results.push({ email: normalizedEmail, status: 'duplicate_skipped' });
        continue;
      }

      try {
        const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existingUser) {
          emailsAlreadyProcessed.add(normalizedEmail);
          results.push({ email: normalizedEmail, status: 'already_registered' });
          continue;
        }

        const contact = await hubspot.findContactByEmail(normalizedEmail);
        const displayName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || '';

        const ccAddrs = await hubspot.getCcEmailsForUser(normalizedEmail);
        await emailService.sendRegistrationInviteEmail(normalizedEmail, displayName, ccAddrs);
        emailsAlreadyProcessed.add(normalizedEmail);
        results.push({ email: normalizedEmail, status: 'sent' });

        logger.info('Bulk contact registration invite sent', { email: normalizedEmail });
      } catch (err) {
        results.push({
          email: normalizedEmail,
          status: 'error',
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        action: 'admin_send_bulk_contact_invites',
        entityType: 'bulk',
        entityId: 'contact_invites',
        userEmail: 'admin',
        userType: 'admin',
        details: { emails, results },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    const sentCount = results.filter(r => r.status === 'sent').length;
    const dupCount = results.filter(r => r.status === 'duplicate_skipped').length;
    logger.info('Bulk contact registration invites completed', { total: emails.length, sent: sentCount, duplicatesSkipped: dupCount });

    res.json({
      success: true,
      results,
      summary: {
        total: results.length,
        sent: sentCount,
        alreadyRegistered: results.filter(r => r.status === 'already_registered').length,
        duplicateSkipped: dupCount,
        errors: results.filter(r => r.status === 'error').length
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0]?.message || 'Invalid request', 400));
    } else {
      next(error);
    }
  }
});

// POST /api/admin/send-contact-invite - Send registration invite to a single contact by email
router.post('/send-contact-invite', async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email()
    });
    const { email } = schema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    // Check if already registered
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User is already registered.'
      });
    }

    // Get contact name for personalization
    const contact = await hubspot.findContactByEmail(normalizedEmail);
    const displayName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || '';

    const ccEmails = await hubspot.getCcEmailsForUser(normalizedEmail);
    await emailService.sendRegistrationInviteEmail(normalizedEmail, displayName, ccEmails);

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'admin_send_contact_invite',
        entityType: 'contact',
        entityId: contact?.id || normalizedEmail,
        userEmail: 'admin',
        userType: 'admin',
        details: { targetEmail: normalizedEmail },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Contact registration invite sent', { email: normalizedEmail });

    res.json({
      success: true,
      message: `Registration invite sent to ${normalizedEmail}`
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid email address', 400));
    } else {
      next(error);
    }
  }
});

// POST /api/admin/send-password-reset - Admin-triggered password reset for a contact
router.post('/send-password-reset', async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email()
    });
    const { email } = schema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    // Find user in local DB
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'User has not registered yet. Send a registration invite instead.'
      });
    }

    // Check for existing valid token
    const existingToken = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } }
    });

    let token: string;
    if (existingToken) {
      token = existingToken.token;
    } else {
      token = crypto.randomBytes(32).toString('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS)
        }
      });
    }

    // Get contact name for personalization
    const contact = await hubspot.findContactByEmail(normalizedEmail);
    const displayName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || '';

    const ccEmails = await hubspot.getCcEmailsForUser(normalizedEmail);
    await emailService.sendAdminPasswordResetEmail(normalizedEmail, token, displayName, ccEmails);

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'admin_send_password_reset',
        entityType: 'user',
        entityId: user.id,
        userEmail: 'admin',
        userType: 'admin',
        details: { targetEmail: normalizedEmail },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin-triggered password reset sent', { email: normalizedEmail });

    res.json({
      success: true,
      message: `Password reset email sent to ${normalizedEmail}`
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid email address', 400));
    } else {
      next(error);
    }
  }
});

// POST /api/admin/upload-digest/send - Manually trigger an upload digest email
router.post('/upload-digest/send', async (req, res, next) => {
  try {
    const schema = z.object({
      frequency: z.enum(['daily', 'weekly'])
    });
    const { frequency } = schema.parse(req.body);

    const result = await runUploadDigest(frequency);

    await prisma.auditLog.create({
      data: {
        action: 'admin_trigger_upload_digest',
        entityType: 'digest',
        entityId: frequency,
        userEmail: 'admin',
        userType: 'admin',
        details: result,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin triggered upload digest', { frequency, result });

    res.json({
      success: true,
      ...result,
      message: result.skipped
        ? 'No recipients or no uploads for this period'
        : `Digest sent to ${result.sent} recipient(s)`
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid frequency - must be "daily" or "weekly"', 400));
    } else {
      next(error);
    }
  }
});

// GET /api/admin/registered-users - List everyone who has registered for the portal
router.get('/registered-users', async (req, res, next) => {
  try {
    const { search } = req.query;

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });

    // Resolve display names from HubSpot in a single batch read.
    const contactIds = users
      .map(u => u.hubspotContactId)
      .filter((id): id is string => Boolean(id));
    const contactMap = await hubspot.getContactsByIds(contactIds);

    let rows = users.map(u => {
      const contact = u.hubspotContactId ? contactMap.get(u.hubspotContactId) : undefined;
      const displayName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ');
      return {
        id: u.id,
        email: u.email,
        displayName: displayName || null,
        hubspotContactId: u.hubspotContactId,
        registeredAt: u.createdAt,
        lastLoginAt: u.lastLoginAt
      };
    });

    if (search && typeof search === 'string') {
      const q = search.toLowerCase().trim();
      rows = rows.filter(
        r => r.email.toLowerCase().includes(q) || (r.displayName || '').toLowerCase().includes(q)
      );
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const registeredLast7Days = users.filter(u => u.createdAt >= weekAgo).length;

    logger.info('Admin fetched registered users', { count: rows.length });

    res.json({
      success: true,
      users: rows,
      total: users.length,
      registeredLast7Days
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/weekly-digest/settings - Get weekly client digest on/off state
router.get('/weekly-digest/settings', async (_req, res, next) => {
  try {
    const enabled = await getWeeklyClientDigestEnabled();
    res.json({ success: true, enabled });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/weekly-digest/settings - Enable or disable the weekly client digest
router.put('/weekly-digest/settings', async (req, res, next) => {
  try {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    const saved = await setWeeklyClientDigestEnabled(enabled);

    await prisma.auditLog.create({
      data: {
        action: 'admin_set_weekly_digest_enabled',
        entityType: 'setting',
        entityId: 'weeklyClientDigestEnabled',
        userEmail: 'admin',
        userType: 'admin',
        details: { enabled: saved },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin updated weekly client digest setting', { enabled: saved });
    res.json({ success: true, enabled: saved });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request - "enabled" must be a boolean', 400));
    } else {
      next(error);
    }
  }
});

// POST /api/admin/weekly-digest/send - Manually trigger the weekly client digest now.
// Optional body { emails: string[] } sends to only that subset of clients.
router.post('/weekly-digest/send', async (req, res, next) => {
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const { emails } = z.object({ emails: z.array(z.string().email()).optional() }).parse(body || {});
    const isSubset = Boolean(emails && emails.length > 0);

    // Manual sends always run (skip the global on/off gate); per-client opt-outs
    // are still respected inside the digest send.
    const clientResult = await runWeeklyClientDigest({ filterEmails: emails, skipGlobalCheck: true });

    // Only refresh the admin summary on a full send, not targeted subsets.
    if (!isSubset) {
      await runAdminWeeklySummary().catch(err =>
        logger.error('Admin weekly summary failed during manual digest run', { error: String(err) })
      );
    }

    await prisma.auditLog.create({
      data: {
        action: 'admin_trigger_weekly_client_digest',
        entityType: 'digest',
        entityId: isSubset ? 'weekly_client_subset' : 'weekly_client',
        userEmail: 'admin',
        userType: 'admin',
        details: { ...clientResult, emails: emails ?? 'all' },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin triggered weekly client digest', { ...clientResult, isSubset });

    const skipNote = clientResult.skippedNoAction > 0
      ? ` ${clientResult.skippedNoAction} client(s) were skipped because nothing is in the Action column.`
      : '';
    let message: string;
    if (clientResult.sent > 0) {
      message = `Weekly digest sent to ${clientResult.sent} client(s).${skipNote}`;
    } else if (clientResult.skippedNoAction > 0 && clientResult.skipped) {
      message = `No emails sent.${skipNote}`;
    } else if (clientResult.skipped) {
      message = 'No matching clients to send (no projects are still collecting documents).';
    } else {
      message = `No emails sent. Matching clients have the weekly digest turned off.${skipNote}`;
    }

    res.json({
      success: true,
      ...clientResult,
      message
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request - "emails" must be an array of email addresses', 400));
    } else {
      next(error);
    }
  }
});

// GET /api/admin/weekly-digest/clients - List all clients with their per-client digest state
router.get('/weekly-digest/clients', async (_req, res, next) => {
  try {
    const { projects } = await hubspot.getAllProjects();

    // Group projects by client email, tracking a representative project name + count.
    // Only clients with at least one project still collecting documents are eligible.
    const byEmail = new Map<string, { projectCount: number; sampleName: string; actionNeeded: number }>();
    const season = await getTaxSeasonSettings();
    for (const p of projects) {
      if (hubspot.projectIsAdvisory(p)) continue;
      if (!isInDocumentCollectionPhase(p.properties.hs_pipeline_stage)) continue;
      // Same eligibility the digest uses. actionNeeded is the extra gate:
      // a client with 0 will not be emailed until a document needs their action.
      if (!hubspot.projectVisibleInSeason(p, season)) continue;

      const email = p.properties.email?.toLowerCase().trim();
      if (!email) continue;
      const actionNeeded = countClientActionNeeded(
        hubspot.parseDocumentData(p.properties.document_data)
      );
      const existing = byEmail.get(email);
      if (existing) {
        existing.projectCount++;
        existing.actionNeeded += actionNeeded;
      } else {
        byEmail.set(email, {
          projectCount: 1,
          sampleName: p.properties.client_project_name || '',
          actionNeeded
        });
      }
    }

    const emails = [...byEmail.keys()];
    if (emails.length === 0) {
      return res.json({ success: true, clients: [], total: 0 });
    }

    // Per-client weeklyUpdate preference (default ON when no record exists).
    const prefs = await prisma.notificationPreference.findMany({
      where: { email: { in: emails } }
    });
    const prefMap = new Map(prefs.map(p => [p.email, p.weeklyUpdate]));

    // Resolve display names cheaply: registered users have a HubSpot contact id
    // we can batch-read. Unregistered clients fall back to the project name.
    const registeredUsers = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true, hubspotContactId: true }
    });
    const contactIdByEmail = new Map(
      registeredUsers
        .filter(u => u.hubspotContactId)
        .map(u => [u.email, u.hubspotContactId as string])
    );
    const contactMap = await hubspot.getContactsByIds([...contactIdByEmail.values()]);

    const clients = emails
      .map(email => {
        const info = byEmail.get(email)!;
        const contactId = contactIdByEmail.get(email);
        const contact = contactId ? contactMap.get(contactId) : undefined;
        const contactName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ');
        return {
          email,
          displayName: contactName || info.sampleName || null,
          projectCount: info.projectCount,
          actionNeeded: info.actionNeeded,
          weeklyUpdate: prefMap.has(email) ? prefMap.get(email)! : true,
          registered: contactIdByEmail.has(email) || registeredUsers.some(u => u.email === email)
        };
      })
      .sort((a, b) => a.email.localeCompare(b.email));

    logger.info('Admin fetched weekly digest clients', { count: clients.length });

    res.json({ success: true, clients, total: clients.length });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/weekly-digest/clients - Enable/disable the weekly digest for one client
router.patch('/weekly-digest/clients', async (req, res, next) => {
  try {
    const { email, enabled } = z.object({
      email: z.string().email(),
      enabled: z.boolean()
    }).parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const prefs = await prisma.notificationPreference.upsert({
      where: { email: normalizedEmail },
      create: { email: normalizedEmail, weeklyUpdate: enabled },
      update: { weeklyUpdate: enabled }
    });

    logger.info('Admin updated client weekly digest preference', { email: normalizedEmail, enabled });

    res.json({ success: true, email: prefs.email, weeklyUpdate: prefs.weeklyUpdate });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request - expected { email, enabled }', 400));
    } else {
      next(error);
    }
  }
});

// PATCH /api/admin/weekly-digest/clients/bulk - Enable/disable the weekly digest for many clients
router.patch('/weekly-digest/clients/bulk', async (req, res, next) => {
  try {
    const { emails, enabled } = z.object({
      emails: z.array(z.string().email()).min(1, 'At least one client must be selected'),
      enabled: z.boolean()
    }).parse(req.body);

    const normalized = [...new Set(emails.map(e => e.toLowerCase().trim()))];

    await Promise.all(
      normalized.map(email =>
        prisma.notificationPreference.upsert({
          where: { email },
          create: { email, weeklyUpdate: enabled },
          update: { weeklyUpdate: enabled }
        })
      )
    );

    logger.info('Admin bulk-updated client weekly digest preferences', { count: normalized.length, enabled });

    res.json({ success: true, updated: normalized.length, enabled });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0]?.message || 'Invalid request', 400));
    } else {
      next(error);
    }
  }
});

// ─── Digest schedules ──────────────────────────────────────────────────

const timezoneSchema = z.enum(ALLOWED_TIMEZONES as [string, ...string[]]);

// GET /api/admin/weekly-digest/schedule - When the client weekly digest sends
router.get('/weekly-digest/schedule', async (_req, res, next) => {
  try {
    const schedule = await getWeeklyClientDigestSchedule();
    res.json({ success: true, schedule, timezones: ALLOWED_TIMEZONES });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/weekly-digest/schedule - Update the client weekly digest schedule
router.put('/weekly-digest/schedule', async (req, res, next) => {
  try {
    const schema = z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      timezone: timezoneSchema
    });
    const input = schema.parse(req.body);

    const schedule = await setWeeklyClientDigestSchedule(input);
    await scheduleClientDigest();

    await prisma.auditLog.create({
      data: {
        action: 'admin_set_weekly_digest_schedule',
        entityType: 'setting',
        entityId: 'weeklyClientDigestSchedule',
        userEmail: 'admin',
        userType: 'admin',
        details: { ...schedule },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin updated client weekly digest schedule', { schedule });
    res.json({ success: true, schedule });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid schedule - check day, time, and timezone', 400));
    } else {
      next(error);
    }
  }
});

// GET /api/admin/upload-digest/schedule - When the admin upload digest sends
router.get('/upload-digest/schedule', async (_req, res, next) => {
  try {
    const schedule = await getUploadDigestSchedule();
    res.json({ success: true, schedule, timezones: ALLOWED_TIMEZONES });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/upload-digest/schedule - Update the admin upload digest schedule
router.put('/upload-digest/schedule', async (req, res, next) => {
  try {
    const schema = z.object({
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      weeklyDayOfWeek: z.number().int().min(0).max(6),
      timezone: timezoneSchema
    });
    const input = schema.parse(req.body);

    const schedule = await setUploadDigestSchedule(input);
    await scheduleUploadDigest();

    await prisma.auditLog.create({
      data: {
        action: 'admin_set_upload_digest_schedule',
        entityType: 'setting',
        entityId: 'adminUploadDigestSchedule',
        userEmail: 'admin',
        userType: 'admin',
        details: { ...schedule },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin updated upload digest schedule', { schedule });
    res.json({ success: true, schedule });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid schedule - check day, time, and timezone', 400));
    } else {
      next(error);
    }
  }
});

// ─── Portal banner ─────────────────────────────────────────────────────

// GET /api/admin/settings/banner - full banner record for the editor
router.get('/settings/banner', async (req, res, next) => {
  try {
    const banner = await getPortalBanner();
    res.json({ success: true, banner, pageOptions: BANNER_PAGE_OPTIONS });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/settings/banner - publish banner changes (takes effect immediately)
router.put('/settings/banner', async (req, res, next) => {
  try {
    const schema = z.object({
      enabled: z.boolean().optional(),
      message: z.string().max(500).optional(),
      style: z.enum(['info', 'warning', 'success']).optional(),
      cta: z
        .object({ label: z.string().max(60), url: z.string().max(500) })
        .nullable()
        .optional(),
      pages: z.union([z.literal('all'), z.array(z.string())]).optional()
    });

    const input = schema.parse(req.body);

    // A banner that is turned on with nothing to say is almost certainly a
    // mistake, and would render an empty bar to every client.
    if (input.enabled && !(input.message ?? (await getPortalBanner()).message).trim()) {
      throw new AppError('Add a message before turning the banner on', 400);
    }

    const banner = await setPortalBanner(input);

    await prisma.auditLog.create({
      data: {
        action: 'update_banner',
        entityType: 'settings',
        entityId: 'portalBanner',
        userType: 'admin',
        details: { enabled: banner.enabled, style: banner.style, pages: banner.pages },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin updated portal banner', { enabled: banner.enabled, style: banner.style });
    res.json({ success: true, banner });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError('Invalid banner settings', 400));
    next(error);
  }
});

// ─── Tax season ────────────────────────────────────────────────────────

const taxYearSchema = z.number().int().min(MIN_TAX_YEAR).max(MAX_TAX_YEAR);

// GET /api/admin/tax-season/settings - just the stored setting.
// Separate from /tax-season because the overview there paginates every project
// in HubSpot; callers that only need the year shouldn't pay for that.
router.get('/tax-season/settings', async (_req, res, next) => {
  try {
    res.json({ success: true, settings: await getTaxSeasonSettings() });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/tax-season - current season config plus what's actually in HubSpot
router.get('/tax-season', async (_req, res, next) => {
  try {
    const [settings, overview, run] = await Promise.all([
      getTaxSeasonSettings(),
      getSeasonOverview(),
      getRolloverRun()
    ]);
    res.json({ success: true, settings, overview, run });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/tax-season - set the current season / portal filter
router.put('/tax-season', async (req, res, next) => {
  try {
    const schema = z.object({
      // null clears the season, which turns the portal filter off entirely.
      currentTaxYear: taxYearSchema.nullable().optional(),
      hidePriorYearProjects: z.boolean().optional()
    });

    const input = schema.parse(req.body);
    const settings = await setTaxSeasonSettings(input);

    await prisma.auditLog.create({
      data: {
        action: 'update_tax_season',
        entityType: 'settings',
        entityId: 'taxSeason',
        userType: 'admin',
        details: { ...settings },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin updated tax season settings', { ...settings });
    res.json({ success: true, settings });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError('Invalid tax season settings', 400));
    next(error);
  }
});

// POST /api/admin/tax-season/rollover/preview - dry run, writes nothing
router.post('/tax-season/rollover/preview', async (req, res, next) => {
  try {
    const { targetYear } = z.object({ targetYear: taxYearSchema }).parse(req.body);
    const plan = await planRollover(targetYear);
    res.json({ success: true, plan });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError('A valid target year is required', 400));
    next(error);
  }
});

// POST /api/admin/tax-season/rollover - start the rollover (runs in background)
router.post('/tax-season/rollover', async (req, res, next) => {
  try {
    const schema = z.object({
      targetYear: taxYearSchema,
      // Echoed back by the UI's confirmation field so a stray click can't
      // create a few hundred CRM records.
      confirmYear: taxYearSchema
    });

    const { targetYear, confirmYear } = schema.parse(req.body);
    if (targetYear !== confirmYear) {
      throw new AppError('Confirmation year does not match the target year', 400);
    }

    const plan = await planRollover(targetYear);
    if (plan.items.length === 0) {
      throw new AppError(`Nothing to roll over — every client already has a ${targetYear} project`, 400);
    }

    // Claiming the slot is atomic, so two admins planning at the same time
    // can't both proceed to create a project for every client. The run itself
    // is detached and reports progress via GET /tax-season/rollover/status.
    const claimed = await startRollover(plan, 'admin');
    if (!claimed) {
      throw new AppError('A rollover is already running', 409);
    }

    logger.info('Admin started tax season rollover', { targetYear, toCreate: plan.items.length });
    res.status(202).json({ success: true, targetYear, total: plan.items.length });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError('A valid target year is required', 400));
    next(error);
  }
});

// GET /api/admin/tax-season/rollover/status - progress for a running/finished run
router.get('/tax-season/rollover/status', async (_req, res, next) => {
  try {
    res.json({ success: true, run: await getRolloverRun() });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/tax-season/backfill - stamp tax_year from project names
router.post('/tax-season/backfill', async (req, res, next) => {
  try {
    const { dryRun } = z.object({ dryRun: z.boolean().default(true) }).parse(req.body ?? {});
    const result = await backfillTaxYears(dryRun);
    res.json({ success: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError('Invalid backfill request', 400));
    next(error);
  }
});

// ─── Files ─────────────────────────────────────────────────────────────
// Staff previously had no working file operations at all: the client upload
// route requires a client JWT, while the admin UI authenticates with an API
// key, so every staff file action 401'd. These are the admin-key equivalents.

function toAdminFileDto(f: {
  id: string; categoryKey: string; documentIndex: number | null;
  originalFilename: string; fileSize: number | null; mimeType: string | null;
  uploadedByEmail: string | null; status: string;
  transferStatus: string; transferError: string | null; createdAt: Date;
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
    transferStatus: f.transferStatus,
    transferError: f.transferError,
    uploadedAt: f.createdAt,
    canDownload: Boolean(f.hubspotFileId || f.storagePath)
  };
}

// GET /api/admin/projects/:id/files - every live file on a project
router.get('/projects/:id/files', async (req, res, next) => {
  try {
    const files = await prisma.fileUpload.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ success: true, files: files.map(toAdminFileDto) });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/files/:id/download - staff download link.
// Mirrors the client route: returns our own streaming URL so the file arrives
// as a download with its real name, whether it is staged or already in HubSpot.
router.get('/files/:id/download', async (req, res, next) => {
  try {
    const record = await prisma.fileUpload.findUnique({ where: { id: req.params.id } });
    if (!record) throw new AppError('File not found', 404);
    if (!record.hubspotFileId && !record.storagePath) {
      throw new AppError('No copy of this file is currently available.', 404);
    }

    res.json({
      success: true,
      url: `/api/files/${record.id}/raw?t=${encodeURIComponent(signDownloadToken(record.id))}`,
      filename: record.originalFilename
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/files/:id - accept or reject a single file
router.patch('/files/:id', async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(['pending_review', 'accepted', 'needs_resubmission'])
    });
    const { status } = schema.parse(req.body);

    const record = await prisma.fileUpload.findUnique({ where: { id: req.params.id } });
    if (!record) throw new AppError('File not found', 404);

    await prisma.fileUpload.update({
      where: { id: req.params.id },
      data: { status }
    });

    // Item status is a roll-up of its files, so re-derive it after the change.
    const documentStatus = await syncDocumentStatusFromFiles(
      record.projectId, record.categoryKey, record.documentIndex
    );

    await prisma.auditLog.create({
      data: {
        action: 'file_review',
        entityType: 'file',
        entityId: record.id,
        userType: 'admin',
        details: {
          projectId: record.projectId,
          filename: record.originalFilename,
          status
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin reviewed file', { fileId: record.id, status });
    res.json({ success: true, status, documentStatus });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError('Invalid review status', 400));
    next(error);
  }
});

// DELETE /api/admin/files/:id - staff removal (allowed at any review state)
router.delete('/files/:id', async (req, res, next) => {
  try {
    const record = await prisma.fileUpload.findUnique({ where: { id: req.params.id } });
    if (!record) throw new AppError('File not found', 404);

    // Same claim as the client route: never delete a row out from under an
    // in-flight push, or HubSpot ends up with an orphaned file and note.
    const claimed = await prisma.fileUpload.updateMany({
      where: { id: record.id, transferStatus: { in: ['pending', 'failed', 'synced'] } },
      data: { transferStatus: 'deleting' }
    });
    if (claimed.count === 0) {
      throw new AppError('This file is being filed right now. Please try again in a moment.', 409);
    }

    await prisma.fileUpload.delete({ where: { id: record.id } });

    if (record.hubspotFileId) await hubspot.deleteFileFromHubSpot(record.hubspotFileId);
    // Object key, not a local path — this must go to the bucket.
    if (record.storagePath) await bucket.deleteObject(record.storagePath);

    const documentStatus = await syncDocumentStatusFromFiles(
      record.projectId, record.categoryKey, record.documentIndex
    );

    await prisma.auditLog.create({
      data: {
        action: 'file_delete',
        entityType: 'file',
        entityId: record.id,
        userType: 'admin',
        details: { projectId: record.projectId, filename: record.originalFilename },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({ success: true, documentStatus });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/files/:id/retry-sync - re-run a failed HubSpot push by hand,
// for when staff don't want to wait for the next sweep.
router.post('/files/:id/retry-sync', async (req, res, next) => {
  try {
    await pushToHubSpot(req.params.id);
    const record = await prisma.fileUpload.findUnique({ where: { id: req.params.id } });
    res.json({
      success: record?.transferStatus === 'synced',
      transferStatus: record?.transferStatus ?? null,
      transferError: record?.transferError ?? null
    });
  } catch (error) {
    next(error);
  }
});

export default router;
