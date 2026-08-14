import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, AlertCircle, X, FileText, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useFileUpload } from '../../hooks/useFileUpload';
import { formatFileSize } from '../../services/files';

interface FileUploadProps {
  projectId: string;
  categoryKey: string;
  documentIndex?: number;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function FileUpload({
  projectId,
  categoryKey,
  documentIndex,
  onSuccess,
  onError
}: FileUploadProps) {
  const {
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
    cancel
  } = useFileUpload({ projectId, categoryKey, documentIndex, onSuccess, onError });

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) addFiles(accepted);
  }, [addFiles]);

  // Rejections are handled in the hook against the server's limits, so the
  // dropzone itself stays permissive — otherwise a file over the limit is
  // silently swallowed with no explanation of why.
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxFiles: config.maxFilesPerUpload,
    disabled: isUploading
  });

  const readyCount = queue.filter(i => i.status === 'queued').length;
  const hasQueue = queue.length > 0;

  return (
    <div className="space-y-3">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={clsx(
          'dropzone cursor-pointer',
          isDragActive && 'dropzone-active',
          isUploading && 'opacity-60 cursor-not-allowed'
        )}
      >
        <input {...getInputProps()} />
        <Upload className={clsx(
          'h-10 w-10 mx-auto mb-3',
          isDragActive ? 'text-primary' : 'text-gray-400'
        )} />
        {isDragActive ? (
          <p className="text-primary">Drop files here...</p>
        ) : (
          <>
            <p className="text-gray-600 mb-1">
              Drag &amp; drop files here, or click to select
            </p>
            <p className="text-sm text-gray-400">
              PDF, Word, Excel, images — up to {config.maxUploadMb} MB each,
              {' '}{config.maxFilesPerUpload} files at a time
            </p>
          </>
        )}
      </div>

      {/* Queue */}
      {hasQueue && (
        <ul className="space-y-2">
          {queue.map(item => (
            <li
              key={item.id}
              className={clsx(
                'flex items-center justify-between gap-3 p-2.5 rounded-lg border text-sm',
                item.status === 'error' && 'border-red-200 bg-red-50',
                item.status === 'done' && 'border-green-200 bg-green-50',
                item.status === 'uploading' && 'border-primary-200 bg-primary-50/40',
                item.status === 'queued' && 'border-gray-200 bg-white'
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {item.status === 'done' ? (
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                ) : item.status === 'error' ? (
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                ) : item.status === 'uploading' ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-gray-900">{item.file.name}</p>
                  {item.status === 'error' ? (
                    <p className="text-red-700 text-xs">{item.error}</p>
                  ) : (
                    <p className="text-gray-500 text-xs">{formatFileSize(item.file.size)}</p>
                  )}
                </div>
              </div>

              {!isUploading && item.status !== 'done' && (
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
                  title="Remove from list"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Progress. The percentage now covers the client's entire wait: the
          response comes back as soon as the file is safely on the volume, and
          the HubSpot handoff happens after the response. The brief second phase
          is just the server writing the record. */}
      {isUploading && (
        <div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            {phase === 'sending' ? (
              <div
                className="bg-primary h-2 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            ) : (
              <div className="bg-primary h-2 rounded-full w-1/3 animate-indeterminate" />
            )}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-sm text-gray-600">
              {phase === 'sending' ? `Uploading… ${progress}%` : 'Saving…'}
            </p>
            {phase === 'sending' && (
              <button onClick={cancel} className="text-sm text-gray-500 hover:text-gray-700 underline">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Batch-level error */}
      {error && !isUploading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
          <span className="text-red-800 text-sm">{error}</span>
        </div>
      )}

      {successCount > 0 && !isUploading && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-green-800 text-sm">
            {successCount} file{successCount === 1 ? '' : 's'} uploaded successfully
          </span>
        </div>
      )}

      {/* Submit */}
      {hasQueue && !isUploading && readyCount > 0 && (
        <button onClick={submit} className="btn-primary w-full">
          Upload {readyCount} file{readyCount === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}
