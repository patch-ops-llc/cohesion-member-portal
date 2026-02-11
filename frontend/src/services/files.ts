import api from './api';
import type { FileUpload } from '../types';

export interface FileInfoResponse {
  success: boolean;
  file: FileUpload;
}

// Get file info
export async function getFileInfo(fileId: string): Promise<FileUpload> {
  const response = await api.get<FileInfoResponse>(`/files/${fileId}`);
  return response.data.file;
}

// Get download URL
export function getDownloadUrl(fileId: string): string {
  const token = localStorage.getItem('auth_token');
  return `/api/files/${fileId}/download?token=${token}`;
}

// Validate file before upload
export function validateFile(file: File): { valid: boolean; error?: string } {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = [
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

  if (file.size > maxSize) {
    return { valid: false, error: 'File size must be less than 5MB' };
  }

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'File type not allowed. Please upload PDF, Word, Excel, images, or text files.' };
  }

  return { valid: true };
}
