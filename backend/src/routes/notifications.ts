import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import prisma from '../db/client';
import * as emailService from '../services/email';
import * as hubspot from '../services/hubspot';
import { getAdminEmails, setAdminEmails } from '../services/settings';

const router = Router();

// ─── User notification preferences ────────────────────────────────────

const userPreferencesSchema = z.object({
  passwordReset: z.boolean().optional(),
  portalRegistration: z.boolean().optional(),
  documentSubmission: z.boolean().optional(),
  weeklyUpdate: z.boolean().optional()
});

// GET /api/notifications/preferences - Get current user's notification preferences
router.get('/preferences', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const email = req.user!.email.toLowerCase().trim();

    let prefs = await prisma.notificationPreference.findUnique({
      where: { email }
    });

    if (!prefs) {
      // Create default preferences
      prefs = await prisma.notificationPreference.create({
        data: { email }
      });
    }

    res.json({
      success: true,
      preferences: {
        passwordReset: prefs.passwordReset,
        portalRegistration: prefs.portalRegistration,
        documentSubmission: prefs.documentSubmission,
        weeklyUpdate: prefs.weeklyUpdate
      }
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/preferences - Update current user's notification preferences
router.patch('/preferences', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const email = req.user!.email.toLowerCase().trim();
    const updates = userPreferencesSchema.parse(req.body);

    const prefs = await prisma.notificationPreference.upsert({
      where: { email },
      create: { email, ...updates },
      update: updates
    });

    logger.info('User notification preferences updated', { email });

    res.json({
      success: true,
      preferences: {
        passwordReset: prefs.passwordReset,
        portalRegistration: prefs.portalRegistration,
        documentSubmission: prefs.documentSubmission,
        weeklyUpdate: prefs.weeklyUpdate
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid preferences', 400));
    } else {
      next(error);
    }
  }
});

// ─── Admin notification email list ────────────────────────────────────

// GET /api/notifications/admin/emails - Get admin email list
router.get('/admin/emails', adminMiddleware, async (_req, res, next) => {
  try {
    const emails = await getAdminEmails();
    res.json({ success: true, emails });
  } catch (error) {
    next(error);
  }
});

// PUT /api/notifications/admin/emails - Set admin email list
router.put('/admin/emails', adminMiddleware, async (req, res, next) => {
  try {
    const { emails } = z.object({ emails: z.array(z.string().email()) }).parse(req.body);
    const saved = await setAdminEmails(emails);
    logger.info('Admin notification emails updated', { count: saved.length });
    res.json({ success: true, emails: saved });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid email list', 400));
    } else {
      next(error);
    }
  }
});

// ─── Admin notification preferences ───────────────────────────────────

const uploadDigestSchema = z.enum(['none', 'daily', 'weekly']);

const adminPreferencesSchema = z.object({
  email: z.string().email(),
  adminRegistration: z.boolean().optional(),
  adminDocumentSubmission: z.boolean().optional(),
  adminWeeklyUpdate: z.boolean().optional(),
  adminUploadDigest: uploadDigestSchema.optional()
});

const adminBulkPreferencesSchema = z.object({
  adminRegistration: z.boolean().optional(),
  adminDocumentSubmission: z.boolean().optional(),
  adminWeeklyUpdate: z.boolean().optional(),
  adminUploadDigest: uploadDigestSchema.optional()
});

// GET /api/notifications/admin/preferences - Get admin notification preferences
router.get('/admin/preferences', adminMiddleware, async (_req, res, next) => {
  try {
    const adminEmailsList = await getAdminEmails();

    const preferences = await Promise.all(
      adminEmailsList.map(async (email) => {
        let prefs = await prisma.notificationPreference.findUnique({
          where: { email: email.toLowerCase().trim() }
        });

        if (!prefs) {
          prefs = await prisma.notificationPreference.create({
            data: { email: email.toLowerCase().trim() }
          });
        }

        return {
          email: prefs.email,
          adminRegistration: prefs.adminRegistration,
          adminDocumentSubmission: prefs.adminDocumentSubmission,
          adminWeeklyUpdate: prefs.adminWeeklyUpdate,
          adminUploadDigest: prefs.adminUploadDigest
        };
      })
    );

    res.json({
      success: true,
      adminEmails: adminEmailsList,
      preferences
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/admin/preferences - Update admin notification preferences for a specific email
router.patch('/admin/preferences', adminMiddleware, async (req, res, next) => {
  try {
    const { email, ...updates } = adminPreferencesSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const prefs = await prisma.notificationPreference.upsert({
      where: { email: normalizedEmail },
      create: { email: normalizedEmail, ...updates },
      update: updates
    });

    logger.info('Admin notification preferences updated', { email: normalizedEmail });

    res.json({
      success: true,
      preferences: {
        email: prefs.email,
        adminRegistration: prefs.adminRegistration,
        adminDocumentSubmission: prefs.adminDocumentSubmission,
        adminWeeklyUpdate: prefs.adminWeeklyUpdate,
        adminUploadDigest: prefs.adminUploadDigest
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid preferences', 400));
    } else {
      next(error);
    }
  }
});

// PATCH /api/notifications/admin/preferences/bulk - Update admin notification preferences for all admin emails
router.patch('/admin/preferences/bulk', adminMiddleware, async (req, res, next) => {
  try {
    const updates = adminBulkPreferencesSchema.parse(req.body);
    const adminEmailsList = await getAdminEmails();

    const results = await Promise.all(
      adminEmailsList.map(async (email) => {
        const normalizedEmail = email.toLowerCase().trim();
        const prefs = await prisma.notificationPreference.upsert({
          where: { email: normalizedEmail },
          create: { email: normalizedEmail, ...updates },
          update: updates
        });
        return {
          email: prefs.email,
          adminRegistration: prefs.adminRegistration,
          adminDocumentSubmission: prefs.adminDocumentSubmission,
          adminWeeklyUpdate: prefs.adminWeeklyUpdate,
          adminUploadDigest: prefs.adminUploadDigest
        };
      })
    );

    logger.info('Bulk admin notification preferences updated', { count: results.length });

    res.json({
      success: true,
      preferences: results
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid preferences', 400));
    } else {
      next(error);
    }
  }
});

// ─── HubSpot card notification preferences ────────────────────────────

// GET /api/notifications/cards/preferences/:email - Get notification preferences for a specific email (for HubSpot card)
router.get('/cards/preferences/:email', async (req, res, next) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    let prefs = await prisma.notificationPreference.findUnique({
      where: { email }
    });

    if (!prefs) {
      prefs = await prisma.notificationPreference.create({
        data: { email }
      });
    }

    res.json({
      success: true,
      preferences: {
        email: prefs.email,
        passwordReset: prefs.passwordReset,
        portalRegistration: prefs.portalRegistration,
        documentSubmission: prefs.documentSubmission,
        weeklyUpdate: prefs.weeklyUpdate,
        adminRegistration: prefs.adminRegistration,
        adminDocumentSubmission: prefs.adminDocumentSubmission,
        adminWeeklyUpdate: prefs.adminWeeklyUpdate,
        adminUploadDigest: prefs.adminUploadDigest
      }
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/cards/preferences/:email - Update notification preferences from HubSpot card
router.patch('/cards/preferences/:email', async (req, res, next) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    const schema = z.object({
      passwordReset: z.boolean().optional(),
      portalRegistration: z.boolean().optional(),
      documentSubmission: z.boolean().optional(),
      weeklyUpdate: z.boolean().optional(),
      adminRegistration: z.boolean().optional(),
      adminDocumentSubmission: z.boolean().optional(),
      adminWeeklyUpdate: z.boolean().optional(),
      adminUploadDigest: uploadDigestSchema.optional()
    });

    const updates = schema.parse(req.body);

    const prefs = await prisma.notificationPreference.upsert({
      where: { email },
      create: { email, ...updates },
      update: updates
    });

    logger.info('Notification preferences updated via HubSpot card', { email });

    res.json({
      success: true,
      preferences: {
        email: prefs.email,
        passwordReset: prefs.passwordReset,
        portalRegistration: prefs.portalRegistration,
        documentSubmission: prefs.documentSubmission,
        weeklyUpdate: prefs.weeklyUpdate,
        adminRegistration: prefs.adminRegistration,
        adminDocumentSubmission: prefs.adminDocumentSubmission,
        adminWeeklyUpdate: prefs.adminWeeklyUpdate,
        adminUploadDigest: prefs.adminUploadDigest
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid preferences', 400));
    } else {
      next(error);
    }
  }
});

// ─── Resend transactional emails from HubSpot card ────────────────────
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// POST /api/notifications/cards/resend/:email - Resend a specific transactional email
router.post('/cards/resend/:email', async (req, res, _next) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {
        return res.status(400).json({ success: false, error: 'Invalid JSON body' });
      }
    }
    // hubspot.fetch may send body without Content-Type header; handle undefined
    if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
      return res.status(400).json({ success: false, error: 'Missing request body. Expected { type: "passwordReset" | "portalRegistration" }' });
    }

    let type: 'passwordReset' | 'portalRegistration';
    try {
      ({ type } = z.object({ type: z.enum(['passwordReset', 'portalRegistration']) }).parse(body));
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid request: type must be "passwordReset" or "portalRegistration"' });
    }

    const ccEmails = await hubspot.getCcEmailsForUser(email);

    if (type === 'passwordReset') {
      // Find user in DB
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return res.status(404).json({ success: false, error: 'No registered user found for this email. The client must register before a password reset can be sent.' });
      }

      // Invalidate existing unused tokens and create a fresh one
      try {
        await prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { expiresAt: new Date() }
        });
      } catch (dbErr) {
        logger.error('Failed to invalidate existing password reset tokens', { email, error: String(dbErr) });
      }

      const token = crypto.randomBytes(32).toString('hex');
      try {
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            token,
            expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS)
          }
        });
      } catch (dbErr) {
        logger.error('Failed to create password reset token', { email, error: String(dbErr) });
        return res.status(500).json({ success: false, error: 'Failed to create password reset token. Please try again.' });
      }

      try {
        await emailService.sendPasswordResetEmail(email, token, ccEmails);
      } catch (emailErr) {
        logger.error('Failed to send password reset email', { email, error: String(emailErr) });
        return res.status(500).json({ success: false, error: 'Failed to send password reset email. Please check email service configuration.' });
      }

      logger.info('Password reset email resent via HubSpot card', { email });
      return res.json({ success: true, message: 'Password reset email sent.' });
    }

    if (type === 'portalRegistration') {
      // Get display name from HubSpot contact
      let displayName = email;
      try {
        const contact = await hubspot.findContactByEmail(email);
        if (contact) {
          displayName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || email;
        }
      } catch (hsErr) {
        logger.warn('Could not fetch contact name from HubSpot, using email as display name', { email, error: String(hsErr) });
      }

      try {
        await emailService.sendRegistrationEmail(email, displayName, ccEmails);
      } catch (emailErr) {
        logger.error('Failed to send registration email', { email, error: String(emailErr) });
        return res.status(500).json({ success: false, error: 'Failed to send registration email. Please check email service configuration.' });
      }

      logger.info('Registration email resent via HubSpot card', { email });
      return res.json({ success: true, message: 'Registration email sent.' });
    }

    // Should not reach here, but just in case
    return res.status(400).json({ success: false, error: 'Invalid type' });
  } catch (error) {
    logger.error('Unexpected error in resend endpoint', { error: String(error), stack: (error as Error)?.stack });
    return res.status(500).json({ success: false, error: 'Failed to send email. Please try again or check server logs.' });
  }
});

export default router;
