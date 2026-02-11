import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

// Admin auth middleware - API key only
export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  const validKey = process.env.ADMIN_API_KEY;

  if (!validKey) {
    return next(new AppError('Admin access not configured', 500));
  }

  if (!apiKey || apiKey !== validKey) {
    return next(new AppError('Admin authentication required', 401));
  }

  next();
}
