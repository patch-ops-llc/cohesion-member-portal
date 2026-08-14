import api from './api';
import type { SubmittedFile, UploadConfig } from '../types';

export interface FileInfoResponse {
  success: boolean;
  file: SubmittedFile;
}

// Fallbacks used only until GET /api/config resolves. The server is the source
// of truth for these limits — never hardcode a ceiling in a component.
export const FALLBACK_UPLOAD_CONFIG: UploadConfig = {
  maxFileSize: 50 * 1024 * 1024,
  maxUploadMb: 50,
  maxFilesPerUpload: 15,
  allowedMimeTypes: [
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
  ],
  allowedExtensions: [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.txt', '.csv'
  ]
};

export async function getUploadConfig(): Promise<UploadConfig> {
  const response = await api.get<{ upload: UploadConfig }>('/config');
  return response.data.upload;
}

// Get file info
export async function getFileInfo(fileId: string): Promise<SubmittedFile> {
  const response = await api.get<FileInfoResponse>(`/files/${fileId}`);
  return response.data.file;
}

// All live files for a project, in one request
export async function getProjectFiles(projectId: string): Promise<SubmittedFile[]> {
  const response = await api.get<{ success: boolean; files: SubmittedFile[] }>(
    `/files/project/${projectId}`
  );
  return response.data.files;
}

// Remove a single file (only permitted while it is still awaiting review)
export async function deleteFile(fileId: string): Promise<void> {
  await api.delete(`/files/${fileId}`);
}

/**
 * Download a file to disk.
 *
 * Two steps because the two halves have different auth: the URL is resolved
 * through the authenticated API (the JWT lives in localStorage and is attached
 * by the axios interceptor), and the returned link carries its own short-lived
 * token so a plain browser navigation can fetch the bytes.
 *
 * The server sends Content-Disposition: attachment, so clicking the link
 * downloads the file rather than navigating the page or opening a tab.
 */
export async function downloadFile(fileId: string, admin = false): Promise<void> {
  const endpoint = admin ? `/admin/files/${fileId}/download` : `/files/${fileId}/download`;
  const response = await api.get<{ url: string; filename: string }>(endpoint);

  const link = document.createElement('a');
  link.href = response.data.url;
  link.download = response.data.filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Validate a file against the server's limits before sending it.
 *
 * Returns a message that tells the client what to do next — the old version
 * said only "File size must be less than 5MB" with no indication of how far
 * over the file actually was.
 */
export function validateFile(
  file: File,
  config: UploadConfig = FALLBACK_UPLOAD_CONFIG
): { valid: boolean; error?: string } {
  if (file.size === 0) {
    return { valid: false, error: 'This file is empty. Please check it and try again.' };
  }

  if (file.size > config.maxFileSize) {
    return {
      valid: false,
      error: `${formatFileSize(file.size)} — over the ${config.maxUploadMb} MB limit. Compress it or split it into smaller files.`
    };
  }

  const dot = file.name.lastIndexOf('.');
  const ext = dot === -1 ? '' : file.name.toLowerCase().slice(dot);
  const typeOk = config.allowedMimeTypes.includes(file.type);
  const extOk = config.allowedExtensions.includes(ext);

  // Browsers report an empty or generic MIME type for some files, so accept
  // when either signal is good rather than rejecting a valid PDF outright.
  if (!typeOk && !extOk) {
    return {
      valid: false,
      error: 'Unsupported file type. Accepted: PDF, Word, Excel, images, and text files.'
    };
  }

  return { valid: true };
}
