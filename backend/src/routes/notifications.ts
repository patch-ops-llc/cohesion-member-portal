import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import prisma from '../db/client';

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

// ─── Admin notification preferences ───────────────────────────────────

const adminPreferencesSchema = z.object({
  email: z.string().email(),
  adminRegistration: z.boolean().optional(),
  adminDocumentSubmission: z.boolean().optional(),
  adminWeeklyUpdate: z.boolean().optional()
});

const adminBulkPreferencesSchema = z.object({
  adminRegistration: z.boolean().optional(),
  adminDocumentSubmission: z.boolean().optional(),
  adminWeeklyUpdate: z.boolean().optional()
});

// GET /api/notifications/admin/preferences - Get admin notification preferences
router.get('/admin/preferences', adminMiddleware, async (_req, res, next) => {
  try {
    const adminEmailsList = (process.env.ADMIN_NOTIFICATION_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

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
          adminWeeklyUpdate: prefs.adminWeeklyUpdate
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
        adminWeeklyUpdate: prefs.adminWeeklyUpdate
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
    const adminEmailsList = (process.env.ADMIN_NOTIFICATION_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

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
          adminWeeklyUpdate: prefs.adminWeeklyUpdate
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
        adminWeeklyUpdate: prefs.adminWeeklyUpdate
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
      adminWeeklyUpdate: z.boolean().optional()
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
        adminWeeklyUpdate: prefs.adminWeeklyUpdate
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

export default router;
