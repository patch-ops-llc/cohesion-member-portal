import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { uploadFiles } from '../services/projects';
import { validateFile, getUploadConfig, FALLBACK_UPLOAD_CONFIG } from '../services/files';
import type { UploadConfig } from '../types';

export type QueueItemStatus = 'queued' | 'uploading' | 'done' | 'error';

export interface QueueItem {
  id: string;
  file: File;
  status: QueueItemStatus;
  error?: string;
}

interface UseFileUploadOptions {
  projectId: string;
  categoryKey: string;
  documentIndex?: number;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

/**
 * Upload limits, fetched from the server once per session.
 *
 * Shared via react-query so every dropzone on the page reads the same value
 * without refetching, and so the ceiling can be changed server-side without a
 * frontend deploy.
 */
export function useUploadConfig(): UploadConfig {
  const { data } = useQuery({
    queryKey: ['upload-config'],
    queryFn: getUploadConfig,
    staleTime: Infinity,
    retry: 1
  });
  return data ?? FALLBACK_UPLOAD_CONFIG;
}

let queueSeq = 0;

export function useFileUpload({
  projectId,
  categoryKey,
  documentIndex,
  onSuccess,
  onError
}: UseFileUploadOptions) {
  const config = useUploadConfig();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  // 'sending' = bytes in flight (measurable). 'processing' = bytes delivered,
  // server is talking to HubSpot (not measurable from the browser).
  const [phase, setPhase] = useState<'sending' | 'processing'>('sending');
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Add files to the queue, rejecting invalid ones up front with a reason
  // attached to the specific file rather than as one opaque banner.
  const addFiles = useCallback((incoming: File[]) => {
    setError(null);
    setQueue(prev => {
      const room = Math.max(0, config.maxFilesPerUpload - prev.length);
      if (room === 0) {
        setError(`You can upload up to ${config.maxFilesPerUpload} files at a time.`);
        return prev;
      }

      const accepted = incoming.slice(0, room).map<QueueItem>(file => {
        const validation = validateFile(file, config);
        return {
          id: `q${++queueSeq}`,
          file,
          status: validation.valid ? 'queued' : 'error',
          error: validation.error
        };
      });

      if (incoming.length > room) {
        setError(`Only the first ${room} file${room === 1 ? '' : 's'} were added — limit is ${config.maxFilesPerUpload} per upload.`);
      }

      return [...prev, ...accepted];
    });
  }, [config]);

  const removeItem = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsUploading(false);
    setProgress(0);
    setPhase('sending');
    setQueue(prev => prev.map(i => (i.status === 'uploading' ? { ...i, status: 'queued' } : i)));
  }, []);

  const submit = useCallback(async () => {
    const ready = queue.filter(item => item.status === 'queued');
    if (ready.length === 0) {
      setError('Add at least one valid file first.');
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setPhase('sending');
    setError(null);
    setQueue(prev => prev.map(i => (i.status === 'queued' ? { ...i, status: 'uploading' } : i)));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await uploadFiles(
        projectId,
        ready.map(i => i.file),
        categoryKey,
        documentIndex,
        setProgress,
        controller.signal,
        () => setPhase('processing')
      );

      const failedByName = new Map(result.failed.map(f => [f.filename, f.error]));

      setQueue(prev =>
        prev.map(item => {
          if (item.status !== 'uploading') return item;
          const failure = failedByName.get(item.file.name);
          return failure
            ? { ...item, status: 'error' as const, error: failure }
            : { ...item, status: 'done' as const };
        })
      );

      setProgress(100);
      setSuccessCount(result.uploaded.length);

      if (result.uploaded.length > 0) {
        onSuccess?.();
        // Clear the finished rows, leaving any failures visible for retry.
        setTimeout(() => {
          setQueue(prev => prev.filter(i => i.status !== 'done'));
          setProgress(0);
          setSuccessCount(0);
        }, 2500);
      }

      if (result.failed.length > 0 && result.uploaded.length === 0) {
        const message = result.failed[0].error;
        setError(message);
        onError?.(message);
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'CanceledError';
      const message = isAbort
        ? 'Upload cancelled.'
        : err instanceof Error
          ? err.message
          : 'Upload failed. Check your connection and try again.';

      setQueue(prev =>
        prev.map(i => (i.status === 'uploading' ? { ...i, status: 'error' as const, error: message } : i))
      );
      setError(message);
      if (!isAbort) onError?.(message);
    } finally {
      setIsUploading(false);
      abortRef.current = null;
    }
  }, [queue, projectId, categoryKey, documentIndex, onSuccess, onError]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setQueue([]);
    setIsUploading(false);
    setProgress(0);
    setPhase('sending');
    setError(null);
    setSuccessCount(0);
  }, []);

  return {
    config,
    queue,
    isUploading,
    progress,
    phase,
    error,
    successCount,
    addFiles,
    removeItem,
    submit,
    cancel,
    reset
  };
}
