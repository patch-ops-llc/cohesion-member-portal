import { z } from 'zod';

// Email validation
export const emailSchema = z.string().email().transform(e => e.toLowerCase().trim());

// Document status validation
export const documentStatusSchema = z.enum([
  'not_submitted',
  'pending_review',
  'needs_resubmission',
  'missing_files',
  'accepted'
]);

// Category status validation
export const categoryStatusSchema = z.enum(['active', 'inactive']);

// Document entry validation
export const documentEntrySchema = z.object({
  name: z.string().min(1).max(255),
  status: documentStatusSchema
});

// Category data validation
export const categoryDataSchema = z.object({
  label: z.string().min(1).max(255),
  status: categoryStatusSchema,
  documents: z.array(documentEntrySchema)
});

// Document data validation
export const documentDataSchema = z.object({
  _meta: z.object({
    selectedSections: z.array(z.string())
  })
}).catchall(
  z.union([
    categoryDataSchema,
    z.object({ selectedSections: z.array(z.string()) })
  ])
);

// Modified fields validation
export const modifiedFieldsSchema = z.object({
  sections: z.boolean(),
  categories: z.record(z.string(), z.boolean()),
  documents: z.record(z.string(), z.record(z.string(), z.boolean())),
  statuses: z.record(z.string(), z.record(z.string(), z.boolean()))
});

// File validation
export const allowedMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv'
];

export const allowedExtensions = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.txt', '.csv'
];

// ─── Upload limits ─────────────────────────────────────────────────────
// Single source of truth for the upload ceiling. Change MAX_UPLOAD_MB in the
// environment rather than editing code — the value is served to the frontend
// via GET /api/config so client and server can never disagree.
const DEFAULT_MAX_UPLOAD_MB = 50;
const DEFAULT_MAX_FILES_PER_UPLOAD = 15;

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const maxUploadMb = positiveIntFromEnv('MAX_UPLOAD_MB', DEFAULT_MAX_UPLOAD_MB);
export const maxFileSize = maxUploadMb * 1024 * 1024;
export const maxFilesPerUpload = positiveIntFromEnv('MAX_FILES_PER_UPLOAD', DEFAULT_MAX_FILES_PER_UPLOAD);

// Human-readable size, used in error messages the client actually reads.
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} bytes`;
}

// Validates a file's name/type/size. Accepts either a multer file or the
// metadata the client sends up front when requesting a presigned upload URL,
// so both upload paths enforce identical rules.
export function validateFileMeta(
  originalname: string,
  mimetype: string,
  size: number
): { valid: boolean; error?: string } {
  if (!allowedMimeTypes.includes(mimetype)) {
    return {
      valid: false,
      error: `${originalname} is a ${mimetype || 'unrecognised'} file. Accepted types are PDF, Word, Excel, images, and text files.`
    };
  }

  if (size > maxFileSize) {
    return {
      valid: false,
      error: `${originalname} is ${formatBytes(size)}, which is over the ${maxUploadMb} MB limit. Please compress it or split it into smaller files.`
    };
  }

  if (size === 0) {
    return { valid: false, error: `${originalname} is empty. Please check the file and try again.` };
  }

  const dot = originalname.lastIndexOf('.');
  const ext = dot === -1 ? '' : originalname.toLowerCase().slice(dot);
  if (!allowedExtensions.includes(ext)) {
    return {
      valid: false,
      error: `${originalname} has an unsupported extension (${ext || 'none'}). Accepted types are PDF, Word, Excel, images, and text files.`
    };
  }

  return { valid: true };
}

export function validateFile(file: Express.Multer.File): { valid: boolean; error?: string } {
  return validateFileMeta(file.originalname, file.mimetype, file.size);
}
