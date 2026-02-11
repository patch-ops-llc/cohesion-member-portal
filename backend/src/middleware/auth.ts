import { Request, Response, NextFunction } from 'express';
import { verifyJwt, TokenPayload } from '../services/auth';
import { AppError } from './errorHandler';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

// Verify JWT token middleware
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw new AppError('Authorization header required', 401);
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AppError('Invalid authorization format', 401);
    }

    const token = parts[1];
    const payload = verifyJwt(token);
    
    req.user = payload;
    next();
  } catch (error) {
    next(new AppError('Invalid or expired token', 401));
  }
}

// Optional auth - doesn't fail if no token
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const token = parts[1];
        req.user = verifyJwt(token);
      }
    }
    
    next();
  } catch {
    // Ignore errors, just continue without user
    next();
  }
}
