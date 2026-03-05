import { Router } from 'express';
import { z } from 'zod';
import { adminMiddleware } from '../middleware/admin';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import prisma from '../db/client';
import { DEFAULT_TEMPLATES } from '../services/emailTemplateDefaults';

type EmailTemplateRecord = Awaited<ReturnType<typeof prisma.emailTemplate.findMany>>[number];

const router = Router();

// GET /api/email-templates - List all email templates (seed defaults if missing)
router.get('/', adminMiddleware, async (_req, res, next) => {
  try {
    let templates: EmailTemplateRecord[] = await prisma.emailTemplate.findMany({
      orderBy: { key: 'asc' }
    });

    if (templates.length === 0) {
      templates = await seedDefaults();
    }

    const existingKeys = new Set(templates.map((t: EmailTemplateRecord) => t.key));
    const missing = DEFAULT_TEMPLATES.filter(d => !existingKeys.has(d.key));
    if (missing.length > 0) {
      const created = await Promise.all(
        missing.map(d => prisma.emailTemplate.create({ data: d }))
      );
      templates = [...templates, ...created].sort((a, b) => a.key.localeCompare(b.key));
    }

    res.json({ success: true, templates });
  } catch (error) {
    next(error);
  }
});

// GET /api/email-templates/:key - Get a single template
router.get('/:key', adminMiddleware, async (req, res, next) => {
  try {
    const { key } = req.params;

    let template = await prisma.emailTemplate.findUnique({ where: { key } });

    if (!template) {
      const def = DEFAULT_TEMPLATES.find(d => d.key === key);
      if (!def) throw new AppError('Template not found', 404);
      template = await prisma.emailTemplate.create({ data: def });
    }

    res.json({ success: true, template });
  } catch (error) {
    next(error);
  }
});

const updateSchema = z.object({
  senderName: z.string().min(1).max(200).optional(),
  senderEmail: z.string().email().optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional()
});

// PUT /api/email-templates/:key - Update a template
router.put('/:key', adminMiddleware, async (req, res, next) => {
  try {
    const { key } = req.params;
    const updates = updateSchema.parse(req.body);

    let template = await prisma.emailTemplate.findUnique({ where: { key } });
    if (!template) {
      const def = DEFAULT_TEMPLATES.find(d => d.key === key);
      if (!def) throw new AppError('Template not found', 404);
      template = await prisma.emailTemplate.create({ data: def });
    }

    template = await prisma.emailTemplate.update({
      where: { key },
      data: updates
    });

    logger.info('Email template updated', { key });
    res.json({ success: true, template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid template data', 400));
    } else {
      next(error);
    }
  }
});

// POST /api/email-templates/reset/:key - Reset a template to defaults
router.post('/reset/:key', adminMiddleware, async (req, res, next) => {
  try {
    const { key } = req.params;
    const def = DEFAULT_TEMPLATES.find(d => d.key === key);
    if (!def) throw new AppError('Template not found', 404);

    const template = await prisma.emailTemplate.upsert({
      where: { key },
      create: def,
      update: {
        senderName: def.senderName,
        senderEmail: def.senderEmail,
        subject: def.subject,
        body: def.body,
        label: def.label,
        variables: def.variables
      }
    });

    logger.info('Email template reset to default', { key });
    res.json({ success: true, template });
  } catch (error) {
    next(error);
  }
});

// ─── HubSpot card endpoints (no admin auth) ───────────────────────────

// GET /api/email-templates/cards/all - List all templates (for HubSpot card)
router.get('/cards/all', async (_req, res, next) => {
  try {
    let templates: EmailTemplateRecord[] = await prisma.emailTemplate.findMany({
      orderBy: { key: 'asc' }
    });

    if (templates.length === 0) {
      templates = await seedDefaults();
    }

    const existingKeys = new Set(templates.map((t: EmailTemplateRecord) => t.key));
    const missing = DEFAULT_TEMPLATES.filter(d => !existingKeys.has(d.key));
    if (missing.length > 0) {
      const created = await Promise.all(
        missing.map(d => prisma.emailTemplate.create({ data: d }))
      );
      templates = [...templates, ...created].sort((a, b) => a.key.localeCompare(b.key));
    }

    res.json({ success: true, templates });
  } catch (error) {
    next(error);
  }
});

// PUT /api/email-templates/cards/:key - Update template from HubSpot card
router.put('/cards/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const updates = updateSchema.parse(req.body);

    let template = await prisma.emailTemplate.findUnique({ where: { key } });
    if (!template) {
      const def = DEFAULT_TEMPLATES.find(d => d.key === key);
      if (!def) throw new AppError('Template not found', 404);
      template = await prisma.emailTemplate.create({ data: def });
    }

    template = await prisma.emailTemplate.update({
      where: { key },
      data: updates
    });

    logger.info('Email template updated via HubSpot card', { key });
    res.json({ success: true, template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid template data', 400));
    } else {
      next(error);
    }
  }
});

async function seedDefaults() {
  return Promise.all(
    DEFAULT_TEMPLATES.map(d =>
      prisma.emailTemplate.upsert({
        where: { key: d.key },
        create: d,
        update: {}
      })
    )
  );
}

export default router;
