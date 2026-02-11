import { useQuery } from '@tanstack/react-query';
import { FileText, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import { InlineLoader } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorBoundary';

interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  userType: string | null;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
  user?: { email: string } | null;
}

export function AuditLog() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'audit-log'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; entries: AuditEntry[] }>(
        '/admin/audit-log?limit=100'
      );
      return response.data.entries;
    }
  });

  if (isLoading) {
    return <InlineLoader message="Loading audit log..." />;
  }

  if (error) {
    return (
      <ErrorMessage
        message={error instanceof Error ? error.message : 'Failed to load audit log'}
        onRetry={refetch}
      />
    );
  }

  if (!data?.length) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => refetch()} className="btn-ghost">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Entity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                    {entry.action.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className="text-gray-900">{entry.user?.email || 'System'}</span>
                  {entry.userType && (
                    <span className="ml-2 text-xs text-gray-400">({entry.userType})</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {entry.entityType && (
                    <span>
                      {entry.entityType}: {entry.entityId?.slice(0, 8)}...
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                  {entry.details && typeof entry.details === 'object' 
                    ? JSON.stringify(entry.details).slice(0, 50) + '...'
                    : '-'
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
