import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, ExternalLink } from 'lucide-react';
import api from '../../services/api';
import { InlineLoader } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorBoundary';
import { DocumentStatusEditor } from './DocumentStatusEditor';
import { personalCategories, entityCategories } from '../../types';
import type { DocumentData, CategoryData, DocumentStatus, FileUpload } from '../../types';

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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ 
      categoryKey, 
      docIndex, 
      status 
    }: { 
      categoryKey: string; 
      docIndex: number; 
      status: DocumentStatus;
    }) => {
      await api.patch(
        `/admin/projects/${projectId}/document/${categoryKey}/${docIndex}/status`,
        { status }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'project', projectId] });
    }
  });

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

  const selectedSections = data.documentData._meta?.selectedSections || ['personal'];
  const showPersonal = selectedSections.includes('personal');
  const showEntity = selectedSections.includes('entity');

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

      {/* Document management */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Document Status Management</h2>
          {updateStatusMutation.isPending && (
            <span className="text-sm text-gray-500 flex items-center">
              <Save className="h-4 w-4 mr-1 animate-pulse" />
              Saving...
            </span>
          )}
        </div>

        <div className="space-y-6">
          {/* Personal */}
          {showPersonal && (
            <div>
              <h3 className="text-md font-medium text-gray-900 mb-4 flex items-center">
                <span className="bg-primary-50 text-primary px-2 py-0.5 rounded text-sm mr-2">
                  Personal
                </span>
              </h3>
              <div className="space-y-4">
                {personalCategories.map((cat) => {
                  const categoryData = data.documentData[cat.key] as CategoryData | undefined;
                  if (!categoryData || categoryData.status !== 'active') return null;
                  return (
                    <CategoryStatusEditor
                      key={cat.key}
                      categoryKey={cat.key}
                      label={cat.label}
                      documents={categoryData.documents}
                      onUpdateStatus={(docIndex, status) =>
                        updateStatusMutation.mutate({ categoryKey: cat.key, docIndex, status })
                      }
                      isPending={updateStatusMutation.isPending}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Entity */}
          {showEntity && (
            <div>
              <h3 className="text-md font-medium text-gray-900 mb-4 flex items-center">
                <span className="bg-accent-50 text-accent-600 px-2 py-0.5 rounded text-sm mr-2">
                  Entity
                </span>
              </h3>
              <div className="space-y-4">
                {entityCategories.map((cat) => {
                  const categoryData = data.documentData[cat.key] as CategoryData | undefined;
                  if (!categoryData || categoryData.status !== 'active') return null;
                  return (
                    <CategoryStatusEditor
                      key={cat.key}
                      categoryKey={cat.key}
                      label={cat.label}
                      documents={categoryData.documents}
                      onUpdateStatus={(docIndex, status) =>
                        updateStatusMutation.mutate({ categoryKey: cat.key, docIndex, status })
                      }
                      isPending={updateStatusMutation.isPending}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

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

interface CategoryStatusEditorProps {
  categoryKey: string;
  label: string;
  documents: Array<{ name: string; status: DocumentStatus }>;
  onUpdateStatus: (docIndex: number, status: DocumentStatus) => void;
  isPending: boolean;
}

function CategoryStatusEditor({ 
  label, 
  documents, 
  onUpdateStatus, 
  isPending 
}: CategoryStatusEditorProps) {
  if (documents.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 font-medium text-gray-700">
        {label}
      </div>
      <div className="divide-y divide-gray-100">
        {documents.map((doc, index) => (
          <div key={index} className="px-4 py-3 flex items-center justify-between">
            <span className="text-gray-900">{doc.name}</span>
            <DocumentStatusEditor
              status={doc.status}
              onChange={(status) => onUpdateStatus(index, status)}
              disabled={isPending}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
