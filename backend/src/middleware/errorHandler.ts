import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { logger } from '../utils/logger';
import { maxUploadMb, maxFilesPerUpload } from '../utils/validation';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  // Multer rejections are a normal client-side outcome (file too big, too many
  // files), not a server fault. Untranslated they surfaced as an opaque 500,
  // which told the client nothing about what to do next.
  if (err instanceof MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: `That file is larger than the ${maxUploadMb} MB limit. Please compress it or split it into smaller files.`,
      LIMIT_FILE_COUNT: `Please upload at most ${maxFilesPerUpload} files at a time.`,
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field in the upload.',
      LIMIT_PART_COUNT: 'Too many parts in the upload.'
    };
    const message = messages[err.code] || 'That upload could not be accepted.';

    logger.warn('Upload rejected', { code: err.code, path: req.path, ip: req.ip });
    res.status(413).json({ error: message, code: err.code });
    return;
  }

  const statusCode = 'statusCode' in err ? err.statusCode : 500;
  const isOperational = 'isOperational' in err ? err.isOperational : false;

  logger.error(err.message, {
    statusCode,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  if (isOperational) {
    res.status(statusCode).json({
      error: err.message
    });
  } else {
    // Don't leak error details in production
    res.status(500).json({
      error: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : err.message
    });
  }
}
