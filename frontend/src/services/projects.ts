import api from './api';
import type { Project, DocumentData, FileUpload, ModifiedFields } from '../types';

export interface ProjectListResponse {
  success: boolean;
  email: string;
  projects: Project[];
}

export interface ProjectDetailResponse {
  success: true;
  project: Project;
  documentData: DocumentData;
  files: FileUpload[];
}

export interface UpdateDocumentDataResponse {
  success: boolean;
  mergedData: DocumentData;
}

// Get all projects for authenticated user
export async function getProjects(): Promise<Project[]> {
  const response = await api.get<ProjectListResponse>('/projects');
  return response.data.projects;
}

// Get single project details (requires auth token)
export async function getProject(projectId: string): Promise<ProjectDetailResponse> {
  const response = await api.get<ProjectDetailResponse>(`/projects/${projectId}`);
  return response.data;
}

// Update document data with merge
export async function updateDocumentData(
  projectId: string,
  documentData: DocumentData,
  modifiedFields: ModifiedFields
): Promise<DocumentData> {
  const response = await api.patch<UpdateDocumentDataResponse>(
    `/projects/${projectId}/document-data`,
    { documentData, modifiedFields }
  );
  return response.data.mergedData;
}

export interface UploadBatchResponse {
  success: boolean;
  uploaded: { uploadId: string; filename: string }[];
  failed: { filename: string; error: string }[];
}

/**
 * Upload one or more files against a single document item.
 *
 * Reports real byte progress via onUploadProgress — the previous implementation
 * animated a fake percentage on a timer, which is tolerable for a 5 MB cap and
 * actively misleading at 50 MB.
 */
export async function uploadFiles(
  projectId: string,
  files: File[],
  categoryKey: string,
  documentIndex?: number,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
  onSendComplete?: () => void
): Promise<UploadBatchResponse> {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  formData.append('categoryKey', categoryKey);
  if (documentIndex !== undefined) {
    formData.append('documentIndex', documentIndex.toString());
  }

  const response = await api.post<UploadBatchResponse>(`/files/${projectId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // Large files on slow connections legitimately exceed the 30s default.
    timeout: 0,
    signal,
    onUploadProgress: (event) => {
      const total = event.total ?? files.reduce((sum, f) => sum + f.size, 0);
      if (total <= 0) return;

      onProgress?.(Math.min(100, Math.round((event.loaded / total) * 100)));

      // Bytes are all sent, but the request is not finished: the server still
      // has to push each file to HubSpot File Manager, create the notes, and
      // update document_data. That wait is invisible to onUploadProgress, so
      // signal the phase change rather than leaving a bar parked at 99%.
      if (event.loaded >= total) onSendComplete?.();
    }
  });

  return response.data;
}

// Single-file convenience wrapper, kept for existing callers.
export async function uploadFile(
  projectId: string,
  file: File,
  categoryKey: string,
  documentIndex?: number
): Promise<UploadBatchResponse> {
  return uploadFiles(projectId, [file], categoryKey, documentIndex);
}
