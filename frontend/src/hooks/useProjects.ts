import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lookupProjects, getProject, updateDocumentData, uploadFile } from '../services/projects';
import { getStoredEmail } from '../services/api';
import type { DocumentData, ModifiedFields } from '../types';

// Hook to get all projects for current email
export function useProjects() {
  const email = getStoredEmail();
  
  return useQuery({
    queryKey: ['projects', email],
    queryFn: () => lookupProjects(email || ''),
    enabled: !!email,
    staleTime: 30000,
    retry: 2
  });
}

// Hook to get single project
export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
    staleTime: 10000,
    retry: 2
  });
}

// Hook to update document data
export function useUpdateDocumentData(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentData, modifiedFields }: { 
      documentData: DocumentData; 
      modifiedFields: ModifiedFields 
    }) => updateDocumentData(projectId, documentData, modifiedFields),
    onSuccess: (mergedData) => {
      queryClient.setQueryData(['project', projectId], (old: Awaited<ReturnType<typeof getProject>> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          documentData: mergedData
        };
      });
    },
    onError: (error) => {
      console.error('Failed to update document data:', error);
    }
  });
}

// Hook to upload file
export function useUploadFile(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, categoryKey, documentIndex }: { 
      file: File; 
      categoryKey: string; 
      documentIndex?: number 
    }) => uploadFile(projectId, file, categoryKey, documentIndex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
    onError: (error) => {
      console.error('Failed to upload file:', error);
    }
  });
}
