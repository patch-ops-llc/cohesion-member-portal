import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import * as hubspot from '../services/hubspot';
import * as emailService from '../services/email';
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
  ALLOWED_TIMEZONES
} from '../services/settings';
import { adminMiddleware } from '../middleware/admin';
import { AppError } from '../middleware/errorHandler';
import { documentStatusSchema } from '../utils/validation';
import { logger } from '../utils/logger';
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
    const result = await hubspot.getAllProjects();
    
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
      projectName: z.string().min(1, 'Project name is required').max(200)
    });

    const { contactId, contactEmail, projectName } = schema.parse(req.body);

    const project = await hubspot.createProject({
      client_project_name: projectName,
      email: contactEmail
    });

    await hubspot.associateProjectWithContact(project.id, contactId);

    await prisma.auditLog.create({
      data: {
        action: 'admin_create_project',
        entityType: 'project',
        entityId: project.id,
        userEmail: 'admin',
        userType: 'admin',
        details: { contactId, contactEmail, projectName },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    logger.info('Admin created project', { projectId: project.id, contactEmail, projectName });

    res.status(201).json({
      success: true,
      project: {
        id: project.id,
        name: projectName,
        email: contactEmail
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

    res.json({
      success: true,
      ...clientResult,
      message: clientResult.skipped
        ? 'No matching clients to send (everyone selected may have opted out)'
        : `Weekly digest sent to ${clientResult.sent} client(s)`
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
    const byEmail = new Map<string, { projectCount: number; sampleName: string }>();
    for (const p of projects) {
      const email = p.properties.email?.toLowerCase().trim();
      if (!email) continue;
      const existing = byEmail.get(email);
      if (existing) {
        existing.projectCount++;
      } else {
        byEmail.set(email, { projectCount: 1, sampleName: p.properties.client_project_name || '' });
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

export default router;
