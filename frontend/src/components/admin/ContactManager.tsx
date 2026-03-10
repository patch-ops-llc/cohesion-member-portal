import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Search, Users, RefreshCw, Mail, KeyRound, Loader2,
  CheckCircle2, XCircle, CheckSquare, Square, MinusSquare, ExternalLink
} from 'lucide-react';
import api from '../../services/api';
import { InlineLoader } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorBoundary';

interface AdminContact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createDate?: string;
  lastModifiedDate?: string;
  isRegistered: boolean;
  lastLoginAt: string | null;
}

interface BulkInviteResult {
  email: string;
  status: 'sent' | 'already_registered' | 'error';
  error?: string;
}

interface BulkInviteResponse {
  success: boolean;
  results: BulkInviteResult[];
  summary: {
    total: number;
    sent: number;
    alreadyRegistered: number;
    errors: number;
  };
}

const HUBSPOT_PORTAL_ID = '242796132';

function getHubSpotContactUrl(contactId: string) {
  return `https://app-na2.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/${contactId}`;
}

export function ContactManager() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [inviteResults, setInviteResults] = useState<BulkInviteResponse | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    email: string;
    type: 'invite' | 'reset';
    status: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'contacts', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);

      const response = await api.get<{
        success: boolean;
        contacts: AdminContact[];
        total: number;
        hasMore: boolean;
      }>(`/admin/contacts?${params}`);
      return response.data;
    }
  });

  const sendInviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await api.post<{ success: boolean; message?: string }>('/admin/send-contact-invite', { email });
      return response.data;
    },
    onSuccess: (_data, email) => {
      setActionFeedback({
        email,
        type: 'invite',
        status: 'success',
        message: `Registration invite sent to ${email}`
      });
      setTimeout(() => setActionFeedback(null), 5000);
    },
    onError: (err, email) => {
      setActionFeedback({
        email,
        type: 'invite',
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to send invite'
      });
      setTimeout(() => setActionFeedback(null), 5000);
    }
  });

  const bulkInviteMutation = useMutation({
    mutationFn: async (emails: string[]) => {
      const response = await api.post<BulkInviteResponse>('/admin/send-bulk-contact-invites', { emails });
      return response.data;
    },
    onSuccess: (data) => {
      setInviteResults(data);
      setSelectedEmails(new Set());
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

  const contacts = data?.contacts || [];

  const unregisteredContacts = useMemo(
    () => contacts.filter(c => !c.isRegistered),
    [contacts]
  );

  const toggleSelect = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  };

  const toggleSelectAllUnregistered = () => {
    if (selectedEmails.size === unregisteredContacts.length && unregisteredContacts.length > 0) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(unregisteredContacts.map(c => c.email)));
    }
  };

  const allUnregisteredSelected = unregisteredContacts.length > 0 && selectedEmails.size === unregisteredContacts.length;
  const someSelected = selectedEmails.size > 0;
  const partialSelected = someSelected && !allUnregisteredSelected;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
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
            placeholder="Search clients by name or email..."
            className="input pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          {someSelected && (
            <button
              onClick={() => bulkInviteMutation.mutate(Array.from(selectedEmails))}
              disabled={bulkInviteMutation.isPending}
              className="btn-primary flex items-center space-x-2"
            >
              {bulkInviteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              <span>Send Registration Invites ({selectedEmails.size})</span>
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

      {/* Bulk Invite Results Banner */}
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

      {/* Bulk Invite Error */}
      {bulkInviteMutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          Failed to send invites: {bulkInviteMutation.error?.message || 'Unknown error'}
        </div>
      )}

      {/* Individual Action Feedback Banner */}
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
        <InlineLoader message="Loading clients..." />
      ) : error ? (
        <ErrorMessage
          message={error instanceof Error ? error.message : 'Failed to load clients'}
          onRetry={refetch}
        />
      ) : !contacts.length ? (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            {search ? 'No clients match your search' : 'No clients found'}
          </p>
        </div>
      ) : (
        <>
          {/* Selection summary */}
          {unregisteredContacts.length > 0 && (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{unregisteredContacts.length} unregistered client{unregisteredContacts.length !== 1 ? 's' : ''}</span>
              {!someSelected && (
                <button
                  onClick={toggleSelectAllUnregistered}
                  className="text-primary hover:text-primary-800 font-medium transition-colors"
                >
                  Select all for invite
                </button>
              )}
              {someSelected && (
                <button
                  onClick={() => setSelectedEmails(new Set())}
                  className="text-gray-400 hover:text-gray-600 font-medium transition-colors"
                >
                  Clear selection
                </button>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={toggleSelectAllUnregistered}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      title={allUnregisteredSelected ? 'Deselect all' : 'Select all unregistered'}
                    >
                      {allUnregisteredSelected ? (
                        <CheckSquare className="h-5 w-5 text-primary" />
                      ) : partialSelected ? (
                        <MinusSquare className="h-5 w-5 text-primary" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {contacts.map((contact) => {
                  const displayName = [contact.firstName, contact.lastName]
                    .filter(Boolean)
                    .join(' ');
                  const isInviteLoading = sendInviteMutation.isPending && sendInviteMutation.variables === contact.email;
                  const isResetLoading = sendResetMutation.isPending && sendResetMutation.variables === contact.email;
                  const isSelected = selectedEmails.has(contact.email);

                  return (
                    <tr
                      key={contact.id}
                      className={`hover:bg-gray-50 ${isSelected ? 'bg-primary-50' : ''}`}
                    >
                      <td className="px-4 py-4">
                        {!contact.isRegistered ? (
                          <button
                            onClick={() => toggleSelect(contact.email)}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-5 w-5 text-primary" />
                            ) : (
                              <Square className="h-5 w-5" />
                            )}
                          </button>
                        ) : (
                          <div className="w-5" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900">
                            {displayName || <span className="text-gray-400 italic">No name</span>}
                          </span>
                          <a
                            href={getHubSpotContactUrl(contact.id)}
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
                        {contact.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {contact.isRegistered ? (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                            Registered
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                            Not Registered
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-sm">
                        {formatDate(contact.lastLoginAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-sm">
                        {formatDate(contact.createDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {!contact.isRegistered ? (
                            <button
                              onClick={() => sendInviteMutation.mutate(contact.email)}
                              disabled={isInviteLoading}
                              className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-800 disabled:opacity-50 transition-colors"
                              title="Send registration invite"
                            >
                              {isInviteLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Mail className="h-3.5 w-3.5" />
                              )}
                              <span>Invite</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => sendResetMutation.mutate(contact.email)}
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
