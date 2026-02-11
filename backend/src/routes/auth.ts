import { Router } from 'express';
import { z } from 'zod';
import { createMagicLink, verifyMagicLink, invalidateSession } from '../services/auth';
import { authMiddleware } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import prisma from '../db/client';

const router = Router();

// POST /api/auth/magic-link - Request a magic link
router.post('/magic-link', async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email()
    });

    const { email } = schema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user has any projects (optional - can be removed for open registration)
    // For now, we'll allow any email to request a magic link

    await createMagicLink(normalizedEmail);

    logger.info('Magic link requested', { email: normalizedEmail, ip: req.ip });

    res.json({
      success: true,
      message: 'If an account exists with this email, a login link has been sent.'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid email address', 400));
    } else {
      next(error);
    }
  }
});

// GET /api/auth/verify/:token - Verify magic link token
router.get('/verify/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token || token.length < 32) {
      throw new AppError('Invalid token', 400);
    }

    const result = await verifyMagicLink(token);

    logger.info('Magic link verified', { userId: result.user.id, ip: req.ip });

    res.json({
      success: true,
      token: result.jwt,
      user: result.user
    });
  } catch (error) {
    if (error instanceof Error) {
      next(new AppError(error.message, 401));
    } else {
      next(new AppError('Verification failed', 401));
    }
  }
});

// POST /api/auth/logout - Logout and invalidate session
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    if (req.user) {
      await invalidateSession(req.user.userId);
      logger.info('User logged out', { userId: req.user.userId });
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me - Get current user
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
        lastLogin: true
      }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
});

export default router;
