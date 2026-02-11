import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjects, getProject, updateDocumentData, uploadFile } from '../services/projects';
import type { DocumentData, ModifiedFields } from '../types';

// Hook to get all projects
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    staleTime: 30000, // 30 seconds
    retry: 2
  });
}

// Hook to get single project
export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
    staleTime: 10000, // 10 seconds
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
      // Update the cache with merged data
      queryClient.setQueryData(['project', projectId], (old: ReturnType<typeof getProject> extends Promise<infer T> ? T : never) => ({
        ...old,
        documentData: mergedData
      }));
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
      // Invalidate project query to refresh data
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
    onError: (error) => {
      console.error('Failed to upload file:', error);
    }
  });
}
