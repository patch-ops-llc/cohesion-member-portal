import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, AlertCircle, X } from 'lucide-react';
import clsx from 'clsx';
import { useFileUpload } from '../../hooks/useFileUpload';

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
  const { isUploading, progress, error, success, upload, reset } = useFileUpload({
    projectId,
    categoryKey,
    documentIndex,
    onSuccess,
    onError
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      upload(acceptedFiles[0]);
    }
  }, [upload]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv']
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: false,
    disabled: isUploading
  });

  // Success state
  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="text-green-800">File uploaded successfully!</span>
        </div>
        <button onClick={reset} className="text-green-600 hover:text-green-800">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
          <button onClick={reset} className="text-red-600 hover:text-red-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <button onClick={reset} className="text-sm text-red-600 underline">
          Try again
        </button>
      </div>
    );
  }

  // Upload in progress
  if (isUploading) {
    return (
      <div className="border-2 border-dashed border-primary rounded-lg p-6">
        <div className="text-center">
          <div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <p className="text-gray-600">Uploading... {progress}%</p>
        </div>
      </div>
    );
  }

  // Dropzone
  return (
    <div
      {...getRootProps()}
      className={clsx(
        'dropzone',
        isDragActive && 'dropzone-active',
        isDragReject && 'dropzone-reject'
      )}
    >
      <input {...getInputProps()} />
      <Upload className={clsx(
        'h-10 w-10 mx-auto mb-3',
        isDragActive ? 'text-primary' : 'text-gray-400'
      )} />
      
      {isDragReject ? (
        <p className="text-red-600">File type not supported</p>
      ) : isDragActive ? (
        <p className="text-primary">Drop file here...</p>
      ) : (
        <>
          <p className="text-gray-600 mb-1">
            Drag & drop a file here, or click to select
          </p>
          <p className="text-sm text-gray-400">
            PDF, Word, Excel, images up to 5MB
          </p>
        </>
      )}
    </div>
  );
}
