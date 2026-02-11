import clsx from 'clsx';
import type { DocumentStatus } from '../../types';

interface DocumentStatusEditorProps {
  status: DocumentStatus;
  onChange: (status: DocumentStatus) => void;
  disabled?: boolean;
}

const statusOptions: Array<{ value: DocumentStatus; label: string; color: string }> = [
  { value: 'not_submitted', label: 'Not Submitted', color: 'bg-gray-100 text-gray-700' },
  { value: 'pending_review', label: 'Pending Review', color: 'bg-amber-100 text-amber-700' },
  { value: 'needs_resubmission', label: 'Needs Resubmission', color: 'bg-red-100 text-red-700' },
  { value: 'missing_files', label: 'Missing Files', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'accepted', label: 'Accepted', color: 'bg-blue-100 text-blue-700' }
];

export function DocumentStatusEditor({ status, onChange, disabled }: DocumentStatusEditorProps) {
  const currentOption = statusOptions.find(o => o.value === status) || statusOptions[0];

  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value as DocumentStatus)}
      disabled={disabled}
      className={clsx(
        'px-3 py-1.5 rounded-lg text-sm font-medium border-0 cursor-pointer focus:ring-2 focus:ring-primary',
        currentOption.color,
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {statusOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
