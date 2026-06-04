import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, RefreshCw, Search, Download, UserCheck, Clock } from 'lucide-react';
import { getRegisteredUsers } from '../../services/notifications';
import { InlineLoader } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorBoundary';
import type { RegisteredUser } from '../../types';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function toCsv(users: RegisteredUser[]): string {
  const header = ['Name', 'Email', 'Registered', 'Last Login', 'HubSpot Contact ID'];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = users.map(u =>
    [
      u.displayName || '',
      u.email,
      u.registeredAt ? new Date(u.registeredAt).toISOString() : '',
      u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : '',
      u.hubspotContactId || ''
    ]
      .map(escape)
      .join(',')
  );
  return [header.map(escape).join(','), ...rows].join('\n');
}

export function RegisteredUsers() {
  const [search, setSearch] = useState('');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'registered-users'],
    queryFn: () => getRegisteredUsers()
  });

  const filtered = useMemo(() => {
    if (!data?.users) return [];
    const q = search.toLowerCase().trim();
    if (!q) return data.users;
    return data.users.filter(
      u => u.email.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q)
    );
  }, [data, search]);

  const handleExport = () => {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `registered-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <InlineLoader message="Loading registered users..." />;
  }

  if (error) {
    return (
      <ErrorMessage
        message={error instanceof Error ? error.message : 'Failed to load registered users'}
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Registered Users</h2>
          <p className="text-sm text-gray-500">
            Everyone who has created a portal account
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Total Registered</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{data?.total ?? 0}</p>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
            <UserCheck className="h-6 w-6" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">New This Week (7d)</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{data?.registeredLast7Days ?? 0}</p>
          </div>
          <div className="p-3 rounded-lg bg-green-50 text-green-600">
            <Clock className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center space-x-1.5 px-3 py-2 text-sm border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center space-x-1.5 px-3 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            {search ? 'No users match your search' : 'No one has registered yet'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Registered
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.displayName || <span className="text-gray-400 italic">Unknown</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.registeredAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.lastLoginAt
                        ? formatDate(user.lastLoginAt)
                        : <span className="text-gray-400">Never</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Showing {filtered.length} of {data?.total ?? 0} registered user(s)
      </p>
    </div>
  );
}
