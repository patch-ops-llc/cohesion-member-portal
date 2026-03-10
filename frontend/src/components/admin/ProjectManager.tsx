import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Search, FolderOpen, ArrowRight, RefreshCw, Mail, CheckSquare, Square, Loader2,
  KeyRound, ExternalLink, CheckCircle2, XCircle
} from 'lucide-react';
import api from '../../services/api';
import { InlineLoader } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorBoundary';

interface AdminProject {
  id: string;
  name: string;
  email: string;
  pipelineStage: string;
  stats: {
    totalDocs: number;
    pendingDocs: number;
    acceptedDocs: number;
  };
}

interface InviteResult {
  email: string;
  status: 'sent' | 'already_registered' | 'no_email' | 'error';
  error?: string;
}

interface InviteResponse {
  success: boolean;
  results: InviteResult[];
  summary: {
    total: number;
    sent: number;
    alreadyRegistered: number;
    noEmail: number;
    errors: number;
  };
}

const HUBSPOT_PORTAL_ID = '242796132';
const HUBSPOT_CUSTOM_OBJECT_TYPE = '2-171216725';

function getHubSpotProjectUrl(projectId: string) {
  return `https://app-na2.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/${HUBSPOT_CUSTOM_OBJECT_TYPE}/${projectId}`;
}

export function ProjectManager() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inviteResults, setInviteResults] = useState<InviteResponse | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    email: string;
    type: 'reset';
    status: 'success' | 'error';
    message: string;
  } | null>(null);

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'projects', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      
      const response = await api.get<{ 
        success: boolean; 
        projects: AdminProject[]; 
        total: number;
        hasMore: boolean;
      }>(`/admin/projects?${params}`);
      return response.data;
    }
  });

  const sendInvitesMutation = useMutation({
    mutationFn: async (projectIds: string[]) => {
      const response = await api.post<InviteResponse>('/admin/send-registration-invites', { projectIds });
      return response.data;
    },
    onSuccess: (data) => {
      setInviteResults(data);
      setSelectedIds(new Set());
    }
  });

  const sendResetMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await api.post<{ success: boolean; message?: string }>('/admin/send-password-reset', { email });
      return response.data;
    },
    onSuccess: (_data, email) => {
      setActionFeedback({
        email,
        type: 'reset',
        status: 'success',
        message: `Password reset sent to ${email}`
      });
      setTimeout(() => setActionFeedback(null), 5000);
    },
    onError: (err, email) => {
      setActionFeedback({
        email,
        type: 'reset',
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to send reset'
      });
      setTimeout(() => setActionFeedback(null), 5000);
    }
  });

  const projects = data?.projects || [];

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map(p => p.id)));
    }
  };

  const allSelected = projects.length > 0 && selectedIds.size === projects.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="space-y-6">
      {/* Search + Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search projects by name or email..."
            className="input pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          {someSelected && (
            <button
              onClick={() => sendInvitesMutation.mutate(Array.from(selectedIds))}
              disabled={sendInvitesMutation.isPending}
              className="btn-primary flex items-center space-x-2"
            >
              {sendInvitesMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              <span>Send Registration Invites ({selectedIds.size})</span>
            </button>
          )}
          <button
            onClick={() => refetch()}
            className="btn-ghost"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Invite Results Banner */}
      {inviteResults && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Invite Results</h3>
              <div className="flex flex-wrap gap-3 text-sm">
                {inviteResults.summary.sent > 0 && (
                  <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                    {inviteResults.summary.sent} sent
                  </span>
                )}
                {inviteResults.summary.alreadyRegistered > 0 && (
                  <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                    {inviteResults.summary.alreadyRegistered} already registered
                  </span>
                )}
                {inviteResults.summary.noEmail > 0 && (
                  <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                    {inviteResults.summary.noEmail} no email
                  </span>
                )}
                {inviteResults.summary.errors > 0 && (
                  <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                    {inviteResults.summary.errors} errors
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setInviteResults(null)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Error from mutation */}
      {sendInvitesMutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          Failed to send invites: {sendInvitesMutation.error?.message || 'Unknown error'}
        </div>
      )}

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`rounded-lg p-4 text-sm flex items-center space-x-2 ${
            actionFeedback.status === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {actionFeedback.status === 'success' ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 flex-shrink-0" />
          )}
          <span>{actionFeedback.message}</span>
          <button
            onClick={() => setActionFeedback(null)}
            className="ml-auto text-xs opacity-60 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <InlineLoader message="Loading projects..." />
      ) : error ? (
        <ErrorMessage
          message={error instanceof Error ? error.message : 'Failed to load projects'}
          onRetry={refetch}
        />
      ) : !projects.length ? (
        <div className="text-center py-12">
          <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            {search ? 'No projects match your search' : 'No projects found'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={toggleSelectAll}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title={allSelected ? 'Deselect all' : 'Select all'}
                  >
                    {allSelected ? (
                      <CheckSquare className="h-5 w-5 text-primary" />
                    ) : (
                      <Square className="h-5 w-5" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Project
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Documents
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pending
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Accepted
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {projects.map((project) => {
                const isResetLoading = sendResetMutation.isPending && sendResetMutation.variables === project.email;

                return (
                  <tr
                    key={project.id}
                    className={`hover:bg-gray-50 ${selectedIds.has(project.id) ? 'bg-primary-50' : ''}`}
                  >
                    <td className="px-4 py-4">
                      <button
                        onClick={() => toggleSelect(project.id)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {selectedIds.has(project.id) ? (
                          <CheckSquare className="h-5 w-5 text-primary" />
                        ) : (
                          <Square className="h-5 w-5" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">{project.name}</span>
                        <a
                          href={getHubSpotProjectUrl(project.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-primary transition-colors"
                          title="Open in HubSpot"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                      {project.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-gray-900">{project.stats.totalDocs}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {project.stats.pendingDocs > 0 ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                          {project.stats.pendingDocs}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {project.stats.acceptedDocs > 0 ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                          {project.stats.acceptedDocs}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {project.email && (
                          <button
                            onClick={() => sendResetMutation.mutate(project.email)}
                            disabled={isResetLoading}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                            title="Send password reset"
                          >
                            {isResetLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <KeyRound className="h-3.5 w-3.5" />
                            )}
                            <span>Reset PW</span>
                          </button>
                        )}
                        <Link
                          to={`/admin/projects/${project.id}`}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg text-primary hover:bg-primary-50 transition-colors"
                        >
                          <span>View</span>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
