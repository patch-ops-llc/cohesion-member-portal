import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, FolderOpen, ArrowRight, RefreshCw, Mail, CheckSquare, Square, Loader2,
  KeyRound, ExternalLink, CheckCircle2, XCircle, Plus, X, UserSearch,
  ChevronLeft, ChevronRight
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

interface ContactSearchResult {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
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

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [contactQuery, setContactQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<ContactSearchResult | null>(null);
  const [projectName, setProjectName] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const queryClient = useQueryClient();

  const handleQueryChange = useCallback((value: string) => {
    setContactQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300);
  }, []);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['admin', 'contacts', 'search', debouncedQuery],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; contacts: ContactSearchResult[] }>(
        `/admin/contacts/search?q=${encodeURIComponent(debouncedQuery)}`
      );
      return response.data.contacts;
    },
    enabled: debouncedQuery.length >= 2 && !selectedContact
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContact) throw new Error('No contact selected');
      const response = await api.post<{ success: boolean; project: { id: string } }>('/admin/projects', {
        contactId: selectedContact.id,
        contactEmail: selectedContact.email,
        projectName: projectName.trim()
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      onCreated();
    }
  });

  const selectContact = (contact: ContactSearchResult) => {
    setSelectedContact(contact);
    setContactQuery('');
    setDebouncedQuery('');
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
    if (name && !projectName) {
      setProjectName(name);
    }
  };

  const clearContact = () => {
    setSelectedContact(null);
    setProjectName('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">New Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Contact Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">HubSpot Contact</label>
            {selectedContact ? (
              <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg px-4 py-3">
                <div>
                  <span className="font-medium text-gray-900">
                    {[selectedContact.firstName, selectedContact.lastName].filter(Boolean).join(' ') || 'No name'}
                  </span>
                  <span className="text-gray-500 ml-2 text-sm">{selectedContact.email}</span>
                </div>
                <button onClick={clearContact} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <UserSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={contactQuery}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder="Search contacts by name or email..."
                  className="input pl-10"
                  autoFocus
                />
                {/* Search Results Dropdown */}
                {debouncedQuery.length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-60 overflow-y-auto">
                    {searchLoading ? (
                      <div className="px-4 py-3 text-sm text-gray-500 flex items-center space-x-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Searching HubSpot...</span>
                      </div>
                    ) : searchResults && searchResults.length > 0 ? (
                      searchResults.map(contact => {
                        const displayName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
                        return (
                          <button
                            key={contact.id}
                            onClick={() => selectContact(contact)}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                          >
                            <div className="font-medium text-gray-900">
                              {displayName || <span className="italic text-gray-400">No name</span>}
                            </div>
                            <div className="text-sm text-gray-500">{contact.email}</div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-500">No contacts found</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Project Name */}
          {selectedContact && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. John Smith 2026 Tax Return"
                className="input"
              />
            </div>
          )}

          {/* Error */}
          {createMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create project'}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!selectedContact || !projectName.trim() || createMutation.isPending}
            className="btn-primary flex items-center space-x-2"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span>Create Project</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export function ProjectManager() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inviteResults, setInviteResults] = useState<InviteResponse | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    email: string;
    type: 'reset' | 'created';
    status: 'success' | 'error';
    message: string;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setCurrentPage(1);
    }, 300);
  };

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'projects'],
    queryFn: async () => {
      const response = await api.get<{ 
        success: boolean; 
        projects: AdminProject[]; 
        total: number;
        hasMore: boolean;
      }>('/admin/projects');
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

  const allProjects = data?.projects || [];

  const filteredProjects = useMemo(() => {
    if (!debouncedSearch) return allProjects;
    const q = debouncedSearch.toLowerCase();
    return allProjects.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    );
  }, [allProjects, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedProjects = filteredProjects.slice(startIndex, startIndex + pageSize);

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

  const pageProjectIds = paginatedProjects.map(p => p.id);
  const allPageSelected = pageProjectIds.length > 0 && pageProjectIds.every(id => selectedIds.has(id));

  const toggleSelectAllPage = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageProjectIds.forEach(id => next.delete(id));
      } else {
        pageProjectIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const someSelected = selectedIds.size > 0;

  const handleProjectCreated = () => {
    setShowCreateModal(false);
    setActionFeedback({
      email: '',
      type: 'created',
      status: 'success',
      message: 'Project created successfully'
    });
    setTimeout(() => setActionFeedback(null), 5000);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

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
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>New Project</span>
          </button>
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
              <span>Send Invites ({selectedIds.size})</span>
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

      {/* Create Project Modal */}
      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleProjectCreated}
        />
      )}

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
      ) : !filteredProjects.length ? (
        <div className="text-center py-12">
          <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">
            {search ? 'No projects match your search' : 'No projects found'}
          </p>
          {!search && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary inline-flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Create your first project</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={toggleSelectAllPage}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      title={allPageSelected ? 'Deselect page' : 'Select page'}
                    >
                      {allPageSelected ? (
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
                {paginatedProjects.map((project) => {
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

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>
                Showing {startIndex + 1}–{Math.min(startIndex + pageSize, filteredProjects.length)} of {filteredProjects.length}
                {debouncedSearch && ` (${allProjects.length} total)`}
              </span>
              <span className="text-gray-300">|</span>
              <div className="flex items-center gap-1.5">
                <span>Show</span>
                {PAGE_SIZE_OPTIONS.map(size => (
                  <button
                    key={size}
                    onClick={() => handlePageSizeChange(size)}
                    className={`px-2 py-0.5 rounded text-sm font-medium transition-colors ${
                      pageSize === size
                        ? 'bg-primary text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
              </button>
              <span className="text-sm text-gray-600 px-2">
                Page {safePage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
