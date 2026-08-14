import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjectFiles, deleteFile } from '../services/files';

/**
 * Files submitted against a project, fetched once and grouped client-side.
 *
 * One request per project rather than one per document item — a checklist with
 * twenty documents would otherwise fire twenty requests and run straight into
 * the API rate limit.
 */
export function useProjectFiles(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-files', projectId],
    queryFn: () => getProjectFiles(projectId!),
    enabled: !!projectId,
    staleTime: 5000
  });
}

export function useDeleteFile(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) => deleteFile(fileId),
    onSuccess: () => {
      // The document's status is a roll-up of its files, so both the file list
      // and the project (which carries document_data) must be refreshed.
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    }
  });
}
