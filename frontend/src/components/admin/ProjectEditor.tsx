import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, ExternalLink, AlertCircle, UserPlus, X, Search, Loader2, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { InlineLoader } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorBoundary';
import { DocumentChecklist } from '../portal/DocumentChecklist';
import { useDocumentData } from '../../hooks/useDocumentData';
import type { DocumentData, FileUpload } from '../../types';

interface AdminProjectDetail {
  project: {
    id: string;
    name: string;
    email: string;
    pipelineStage: string;
    fileDirectory?: string;
  };
  documentData: DocumentData;
  files: FileUpload[];
  auditLog: Array<{
    id: string;
    action: string;
    details: unknown;
    createdAt: string;
  }>;
}

export function ProjectEditor() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'project', projectId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean } & AdminProjectDetail>(
        `/admin/projects/${projectId}`
      );
      return response.data;
    },
    enabled: !!projectId
  });

  const updateDocumentDataMutation = useMutation({
    mutationFn: async (documentData: DocumentData) => {
      await api.patch(
        `/admin/projects/${projectId}/document-data`,
        { documentData }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'project', projectId] });
    }
  });

  const handleSaveDocumentData = async (documentData: DocumentData) => {
    await updateDocumentDataMutation.mutateAsync(documentData);
  };

  if (isLoading) {
    return <InlineLoader message="Loading project..." />;
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link to="/admin/projects" className="inline-flex items-center text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Projects
        </Link>
        <ErrorMessage
          message={error instanceof Error ? error.message : 'Failed to load project'}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link to="/admin/projects" className="inline-flex items-center text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Projects
        </Link>
        {data.project.fileDirectory && (
          <a
            href={data.project.fileDirectory}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline text-sm"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            HubSpot Files
          </a>
        )}
      </div>

      {/* Project info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{data.project.name}</h1>
        <p className="text-gray-600">{data.project.email}</p>
      </div>

      {/* Project contacts */}
      <ProjectContacts projectId={projectId!} />

      {/* Document management - full editing: add documents, remove, edit names, change status */}
      <AdminDocumentChecklistSection
        projectId={projectId!}
        initialData={data.documentData}
        onSave={handleSaveDocumentData}
        isSaving={updateDocumentDataMutation.isPending}
      />

      {/* Recent activity */}
      {data.auditLog.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {data.auditLog.slice(0, 10).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-gray-700">{entry.action.replace(/_/g, ' ')}</span>
                <span className="text-sm text-gray-400">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ProjectContactInfo {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface ContactSearchResult {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

function ProjectContacts({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300);
  }, []);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['admin', 'project', projectId, 'contacts'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; contacts: ProjectContactInfo[] }>(
        `/admin/projects/${projectId}/contacts`
      );
      return response.data.contacts;
    }
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['admin', 'contacts', 'search', debouncedQuery],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; contacts: ContactSearchResult[] }>(
        `/admin/contacts/search?q=${encodeURIComponent(debouncedQuery)}`
      );
      return response.data.contacts;
    },
    enabled: debouncedQuery.length >= 2
  });

  const addMutation = useMutation({
    mutationFn: async (contactId: string) => {
      await api.post(`/admin/projects/${projectId}/contacts`, { contactId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'project', projectId, 'contacts'] });
      setSearchQuery('');
      setDebouncedQuery('');
      setShowSearch(false);
    }
  });

  const removeMutation = useMutation({
    mutationFn: async (contactId: string) => {
      await api.delete(`/admin/projects/${projectId}/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'project', projectId, 'contacts'] });
      setRemoving(null);
    }
  });

  const existingContactIds = new Set(contacts?.map(c => c.id) || []);

  const filteredResults = (searchResults || []).filter(
    c => !existingContactIds.has(c.id)
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Project Contacts</h2>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="btn-outline text-sm"
        >
          {showSearch ? (
            <>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4 mr-1" />
              Add Contact
            </>
          )}
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Contacts associated with this project can log in to the portal and view it.
      </p>

      {/* Add contact search */}
      {showSearch && (
        <div className="mb-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search contacts by name or email..."
              className="input pl-10 w-full"
              autoFocus
            />
          </div>

          {searchLoading && debouncedQuery.length >= 2 && (
            <div className="mt-2 flex items-center text-sm text-gray-500">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Searching...
            </div>
          )}

          {filteredResults.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white max-h-48 overflow-y-auto">
              {filteredResults.map((contact) => {
                const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
                return (
                  <button
                    key={contact.id}
                    onClick={() => addMutation.mutate(contact.id)}
                    disabled={addMutation.isPending}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center justify-between transition-colors"
                  >
                    <div>
                      {name && <span className="font-medium text-gray-900">{name}</span>}
                      <span className={name ? 'text-gray-500 ml-2 text-sm' : 'text-gray-900'}>
                        {contact.email}
                      </span>
                    </div>
                    <UserPlus className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {debouncedQuery.length >= 2 && !searchLoading && filteredResults.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">No matching contacts found.</p>
          )}
        </div>
      )}

      {/* Contact list */}
      {isLoading ? (
        <div className="flex items-center text-sm text-gray-500">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Loading contacts...
        </div>
      ) : !contacts || contacts.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No contacts associated with this project.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {contacts.map((contact) => {
            const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
            return (
              <div key={contact.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  {name && <span className="font-medium text-gray-900">{name}</span>}
                  <span className={name ? 'text-gray-500 ml-2 text-sm' : 'text-gray-900'}>
                    {contact.email}
                  </span>
                </div>
                {removing === contact.id ? (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">Remove?</span>
                    <button
                      onClick={() => removeMutation.mutate(contact.id)}
                      disabled={removeMutation.isPending}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      {removeMutation.isPending ? 'Removing...' : 'Yes'}
                    </button>
                    <button
                      onClick={() => setRemoving(null)}
                      className="text-gray-500 hover:text-gray-700 text-sm"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setRemoving(contact.id)}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                    title="Remove contact"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface AdminDocumentChecklistSectionProps {
  projectId: string;
  initialData: DocumentData;
  onSave: (documentData: DocumentData) => Promise<void>;
  isSaving: boolean;
}

function AdminDocumentChecklistSection({
  projectId,
  initialData,
  onSave,
  isSaving
}: AdminDocumentChecklistSectionProps) {
  const {
    documentData,
    error,
    isSaving: isAutoSaving,
    toggleCategory,
    addDocument,
    updateDocumentName,
    updateDocumentStatus,
    removeDocument
  } = useDocumentData({
    initialData,
    onSave: async (data) => {
      await onSave(data);
    }
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Document Checklist</h2>
        <div className="flex items-center space-x-2 text-sm">
          {(isSaving || isAutoSaving) && (
            <span className="text-gray-500 flex items-center">
              <Save className="h-4 w-4 mr-1 animate-pulse" />
              Saving...
            </span>
          )}
          {error && (
            <span className="text-red-600 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" />
              {error}
            </span>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Add documents, set statuses, and manage categories. Client uploads files in the portal; you approve or request resubmission.
      </p>
      <DocumentChecklist
        projectId={projectId}
        documentData={documentData}
        onToggleCategory={toggleCategory}
        onAddDocument={addDocument}
        onUpdateDocumentName={updateDocumentName}
        onUpdateDocumentStatus={updateDocumentStatus}
        onRemoveDocument={removeDocument}
        clientMode={false}
        isSaving={isSaving || isAutoSaving}
      />
    </div>
  );
}
