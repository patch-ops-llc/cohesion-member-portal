import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import * as hubspot from '../services/hubspot';
import * as emailService from '../services/email';
import { AppError } from '../middleware/errorHandler';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import prisma from '../db/client';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

const emailSchema = z.object({ email: z.string().email() });
const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters')
});

// POST /api/auth/validate-email - Check if email exists in HubSpot, return needsRegistration
router.post('/validate-email', async (req, res, next) => {
  try {
    const { email } = emailSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const isValid = await hubspot.validateEmailInHubSpot(normalizedEmail);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Email not found. Please use the email associated with your account or contact support.'
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    const contact = await hubspot.findContactByEmail(normalizedEmail);
    const hubspotContactId = contact?.id ?? null;

    res.json({
      success: true,
      email: normalizedEmail,
      needsRegistration: !existingUser,
      hubspotContactId
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid email address', 400));
    } else {
      next(error);
    }
  }
});

// POST /api/auth/register - Register new user with password
router.post('/register', async (req, res, next) => {
  try {
    const schema = emailSchema.merge(passwordSchema);
    const { email, password } = schema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const isValid = await hubspot.validateEmailInHubSpot(normalizedEmail);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Email not found. Please use the email associated with your account or contact support.'
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'An account already exists with this email. Please sign in with your password.'
      });
    }

    const contact = await hubspot.findContactByEmail(normalizedEmail);
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        hubspotContactId: contact?.id ?? null
      }
    });

    if (!JWT_SECRET) {
      throw new AppError('Server configuration error', 500);
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY } as jwt.SignOptions
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const displayName =
      [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || user.email;

    logger.info('User registered', { email: normalizedEmail, userId: user.id });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, displayName }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0]?.message || 'Invalid request', 400));
    } else {
      next(error);
    }
  }
});

// POST /api/auth/login - Login with email and password
router.post('/login', async (req, res, next) => {
  try {
    const schema = emailSchema.merge(passwordSchema);
    const { email, password } = schema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const isValid = await hubspot.validateEmailInHubSpot(normalizedEmail);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Email not found. Please use the email associated with your account or contact support.'
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'No account found. Please register first.'
      });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid password.'
      });
    }

    if (!JWT_SECRET) {
      throw new AppError('Server configuration error', 500);
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY } as jwt.SignOptions
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const contact = await hubspot.findContactByEmail(normalizedEmail);
    const displayName =
      [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || user.email;

    logger.info('User logged in', { email: normalizedEmail, userId: user.id });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, displayName }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0]?.message || 'Invalid request', 400));
    } else {
      next(error);
    }
  }
});

// POST /api/auth/forgot-password - Request password reset email
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = emailSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    // Always return success to prevent email enumeration
    if (!user) {
      logger.info('Password reset requested for non-existent user', { email: normalizedEmail });
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.'
      });
    }

    const existingToken = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } }
    });
    if (existingToken) {
      // Don't create duplicate - could send same email again for UX
      await emailService.sendPasswordResetEmail(user.email, existingToken.token);
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.'
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS)
      }
    });

    await emailService.sendPasswordResetEmail(user.email, token);

    logger.info('Password reset token created', { email: normalizedEmail });

    res.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid email address', 400));
    } else {
      next(error);
    }
  }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', async (req, res, next) => {
  try {
    const schema = z.object({
      token: z.string().min(1, 'Reset token is required'),
      password: z.string().min(8, 'Password must be at least 8 characters')
    });
    const { token, password } = schema.parse(req.body);

    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset link. Please request a new password reset.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() }
      })
    ]);

    if (!JWT_SECRET) {
      throw new AppError('Server configuration error', 500);
    }

    const jwtToken = jwt.sign(
      { userId: resetRecord.userId, email: resetRecord.user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY } as jwt.SignOptions
    );

    const contact = await hubspot.findContactByEmail(resetRecord.user.email);
    const displayName =
      [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') ||
      resetRecord.user.email;

    logger.info('Password reset completed', { email: resetRecord.user.email });

    res.json({
      success: true,
      token: jwtToken,
      user: { id: resetRecord.userId, email: resetRecord.user.email, displayName }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0]?.message || 'Invalid request', 400));
    } else {
      next(error);
    }
  }
});

// POST /api/auth/logout - Client-side logout (optional, JWT is stateless)
router.post('/logout', authMiddleware, (_req, res) => {
  res.json({ success: true });
});

// GET /api/auth/me - Get current user (optional)
router.get('/me', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.json({ success: true, user: null });
    }
    const contact = await hubspot.findContactByEmail(req.user.email);
    const displayName =
      [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || req.user.email;
    res.json({
      success: true,
      user: { id: req.user.id, email: req.user.email, displayName }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
