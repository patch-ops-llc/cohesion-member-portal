import { useState, useCallback } from 'react';
import { uploadFile } from '../services/projects';
import { validateFile } from '../services/files';

interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  success: boolean;
}

interface UseFileUploadOptions {
  projectId: string;
  categoryKey: string;
  documentIndex?: number;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function useFileUpload({
  projectId,
  categoryKey,
  documentIndex,
  onSuccess,
  onError
}: UseFileUploadOptions) {
  const [state, setState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    success: false
  });

  const upload = useCallback(async (file: File) => {
    // Validate file first
    const validation = validateFile(file);
    if (!validation.valid) {
      setState(prev => ({ ...prev, error: validation.error || 'Invalid file' }));
      onError?.(validation.error || 'Invalid file');
      return;
    }

    setState({
      isUploading: true,
      progress: 0,
      error: null,
      success: false
    });

    try {
      // Simulate progress (real progress would require XMLHttpRequest)
      const progressInterval = setInterval(() => {
        setState(prev => ({
          ...prev,
          progress: Math.min(prev.progress + 10, 90)
        }));
      }, 200);

      await uploadFile(projectId, file, categoryKey, documentIndex);

      clearInterval(progressInterval);
      
      setState({
        isUploading: false,
        progress: 100,
        error: null,
        success: true
      });

      onSuccess?.();

      // Reset success state after a delay
      setTimeout(() => {
        setState(prev => ({ ...prev, success: false, progress: 0 }));
      }, 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setState({
        isUploading: false,
        progress: 0,
        error: message,
        success: false
      });
      onError?.(message);
    }
  }, [projectId, categoryKey, documentIndex, onSuccess, onError]);

  const reset = useCallback(() => {
    setState({
      isUploading: false,
      progress: 0,
      error: null,
      success: false
    });
  }, []);

  return {
    ...state,
    upload,
    reset
  };
}
