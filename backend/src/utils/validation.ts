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

export const maxFileSize = 5 * 1024 * 1024; // 5MB

export function validateFile(file: Express.Multer.File): { valid: boolean; error?: string } {
  // Check MIME type
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return { valid: false, error: `File type ${file.mimetype} is not allowed` };
  }

  // Check file size
  if (file.size > maxFileSize) {
    return { valid: false, error: 'File size exceeds 5MB limit' };
  }

  // Check extension
  const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
  if (!allowedExtensions.includes(ext)) {
    return { valid: false, error: `File extension ${ext} is not allowed` };
  }

  return { valid: true };
}
