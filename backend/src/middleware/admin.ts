import { Request, Response, NextFunction } from 'express';
import { verifyJwt, verifyAdminApiKey, TokenPayload } from '../services/auth';
import { AppError } from './errorHandler';
import prisma from '../db/client';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      adminUser?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

// Admin auth middleware - supports API key or admin JWT
export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    // Try API key first
    if (apiKey && verifyAdminApiKey(apiKey)) {
      req.adminUser = {
        id: 'api-key-user',
        email: 'api@admin',
        role: 'admin'
      };
      return next();
    }

    // Try JWT
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const token = parts[1];
        const payload = verifyJwt(token);
        
        if (payload.type === 'admin') {
          // Verify admin user exists
          const adminUser = await prisma.adminUser.findUnique({
            where: { email: payload.email }
          });

          if (adminUser) {
            req.adminUser = {
              id: adminUser.id,
              email: adminUser.email,
              role: adminUser.role
            };
            return next();
          }
        }
      }
    }

    throw new AppError('Admin authentication required', 401);
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Admin authentication required', 401));
    }
  }
}
