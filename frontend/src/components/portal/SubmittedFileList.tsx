import { useState } from 'react';
import { FileText, Download, Trash2, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import type { SubmittedFile, FileReviewStatus } from '../../types';
import { formatFileSize, downloadFile } from '../../services/files';

interface SubmittedFileListProps {
  files: SubmittedFile[];
  /** Client view: allow removing own files that are still pending review */
  onDelete?: (fileId: string) => Promise<void> | void;
  /** Staff view: accept / request resubmission per file */
  onReview?: (fileId: string, status: FileReviewStatus) => Promise<void> | void;
  /** Staff view uses the admin-key download endpoint */
  adminMode?: boolean;
  emptyMessage?: string;
}

const reviewLabels: Record<FileReviewStatus, string> = {
  pending_review: 'Pending review',
  accepted: 'Accepted',
  needs_resubmission: 'Resubmit'
};

function ReviewChip({ status }: { status: FileReviewStatus }) {
  return (
    <span
      className={clsx(
        'px-2 py-0.5 text-xs rounded-full whitespace-nowrap',
        status === 'accepted' && 'bg-blue-100 text-blue-700',
        status === 'pending_review' && 'bg-amber-100 text-amber-700',
        status === 'needs_resubmission' && 'bg-red-100 text-red-700'
      )}
    >
      {reviewLabels[status]}
    </span>
  );
}

export function SubmittedFileList({
  files,
  onDelete,
  onReview,
  adminMode = false,
  emptyMessage
}: SubmittedFileListProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (files.length === 0) {
    return emptyMessage ? (
      <p className="text-sm text-gray-500 italic">{emptyMessage}</p>
    ) : null;
  }

  const handleDownload = async (file: SubmittedFile) => {
    setBusyId(file.id);
    setError(null);
    try {
      await downloadFile(file.id, adminMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download that file.');
    } finally {
      setBusyId(null);
    }
  };

  const run = async (id: string, action: () => Promise<void> | void) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {files.length} file{files.length === 1 ? '' : 's'} submitted
      </p>

      <ul className="space-y-2">
        {files.map(file => {
          const isBusy = busyId === file.id;
          // A client may withdraw a file only until staff have accepted it.
          const canDelete = Boolean(onDelete) && file.status !== 'accepted';

          return (
            <li
              key={file.id}
              className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-gray-200 bg-white text-sm"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-gray-900">{file.filename}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)}
                    {file.size ? ' · ' : ''}
                    {new Date(file.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Staged on the volume but not yet in HubSpot. The file is
                    safely stored either way, so this is progress, not failure. */}
                {(file.transferStatus === 'pending' || file.transferStatus === 'transferring') && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3 w-3" /> Filing
                  </span>
                )}
                {file.transferStatus === 'failed' && (
                  <span
                    className="inline-flex items-center gap-1 text-xs text-amber-600"
                    title="Saved safely. Filing to HubSpot failed and will retry automatically."
                  >
                    <AlertCircle className="h-3 w-3" /> Retrying
                  </span>
                )}

                <ReviewChip status={file.status} />

                {onReview && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => run(file.id, () => onReview(file.id, 'accepted'))}
                      disabled={isBusy || file.status === 'accepted'}
                      className="p-1.5 text-gray-400 hover:text-blue-600 disabled:opacity-30 rounded"
                      title="Accept this file"
                    >
                      <CheckCircle className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => run(file.id, () => onReview(file.id, 'needs_resubmission'))}
                      disabled={isBusy || file.status === 'needs_resubmission'}
                      className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30 rounded"
                      title="Request resubmission of this file"
                    >
                      <AlertCircle className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {file.canDownload && (
                  <button
                    onClick={() => handleDownload(file)}
                    className="p-1.5 text-gray-400 hover:text-primary rounded"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                )}

                {canDelete && (
                  <button
                    onClick={() => run(file.id, () => onDelete!(file.id))}
                    disabled={isBusy}
                    className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30 rounded"
                    title="Remove this file"
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
