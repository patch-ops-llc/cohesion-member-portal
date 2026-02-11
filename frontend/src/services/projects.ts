import api, { getStoredEmail } from './api';
import type { Project, DocumentData, FileUpload, ModifiedFields } from '../types';

export interface ProjectListResponse {
  success: boolean;
  email: string;
  projects: Project[];
}

export interface ProjectDetailResponse {
  success: boolean;
  project: Project;
  documentData: DocumentData;
  files: FileUpload[];
}

export interface UpdateDocumentDataResponse {
  success: boolean;
  mergedData: DocumentData;
}

// Lookup projects by email
export async function lookupProjects(email: string): Promise<Project[]> {
  const response = await api.post<ProjectListResponse>('/projects/lookup', { email });
  return response.data.projects;
}

// Get single project details
export async function getProject(projectId: string): Promise<ProjectDetailResponse> {
  const email = getStoredEmail();
  const response = await api.get<ProjectDetailResponse>(`/projects/${projectId}?email=${encodeURIComponent(email || '')}`);
  return response.data;
}

// Update document data with merge
export async function updateDocumentData(
  projectId: string,
  documentData: DocumentData,
  modifiedFields: ModifiedFields
): Promise<DocumentData> {
  const email = getStoredEmail();
  const response = await api.patch<UpdateDocumentDataResponse>(
    `/projects/${projectId}/document-data`,
    { email, documentData, modifiedFields }
  );
  return response.data.mergedData;
}

// Upload file
export async function uploadFile(
  projectId: string,
  file: File,
  categoryKey: string,
  documentIndex?: number
): Promise<{ fileId: string; noteId: string; uploadId: string }> {
  const email = getStoredEmail();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('email', email || '');
  formData.append('categoryKey', categoryKey);
  if (documentIndex !== undefined) {
    formData.append('documentIndex', documentIndex.toString());
  }

  const response = await api.post(`/files/${projectId}/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });

  return response.data;
}
