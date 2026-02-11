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

// Upload file
export async function uploadFile(
  projectId: string,
  file: File,
  categoryKey: string,
  documentIndex?: number
): Promise<{ fileId: string; noteId: string; uploadId: string }> {
  const formData = new FormData();
  formData.append('file', file);
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
