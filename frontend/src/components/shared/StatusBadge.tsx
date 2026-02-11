import { Check, Clock, AlertCircle, FileWarning, Square } from 'lucide-react';
import clsx from 'clsx';
import type { DocumentStatus } from '../../types';

interface StatusBadgeProps {
  status: DocumentStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const statusConfig: Record<DocumentStatus, { 
  label: string; 
  icon: typeof Check;
  className: string;
}> = {
  not_submitted: {
    label: 'Not Submitted',
    icon: Square,
    className: 'status-not_submitted'
  },
  pending_review: {
    label: 'Pending Review',
    icon: Clock,
    className: 'status-pending_review'
  },
  needs_resubmission: {
    label: 'Needs Resubmission',
    icon: AlertCircle,
    className: 'status-needs_resubmission'
  },
  missing_files: {
    label: 'Missing Files',
    icon: FileWarning,
    className: 'status-missing_files'
  },
  accepted: {
    label: 'Accepted',
    icon: Check,
    className: 'status-accepted'
  }
};

const sizeConfig = {
  sm: { badge: 'px-2 py-0.5 text-xs', icon: 'h-3 w-3' },
  md: { badge: 'px-2.5 py-1 text-sm', icon: 'h-4 w-4' },
  lg: { badge: 'px-3 py-1.5 text-base', icon: 'h-5 w-5' }
};

export function StatusBadge({ status, size = 'md', showLabel = true }: StatusBadgeProps) {
  const config = statusConfig[status];
  const sizes = sizeConfig[size];
  const Icon = config.icon;

  return (
    <span 
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        config.className,
        sizes.badge
      )}
    >
      <Icon className={sizes.icon} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

// Icon only variant
export function StatusIcon({ status, size = 'md' }: Omit<StatusBadgeProps, 'showLabel'>) {
  return <StatusBadge status={status} size={size} showLabel={false} />;
}
