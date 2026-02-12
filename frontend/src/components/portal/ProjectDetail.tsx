import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { useProject, useUpdateDocumentData } from '../../hooks/useProjects';
import { useDocumentData } from '../../hooks/useDocumentData';
import { InlineLoader } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorBoundary';
import { PizzaTracker } from './PizzaTracker';
import { DocumentChecklist } from './DocumentChecklist';
import type { DocumentData, ModifiedFields } from '../../types';

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data, isLoading, error, refetch } = useProject(projectId);
  const updateMutation = useUpdateDocumentData(projectId || '');

  const handleSave = async (documentData: DocumentData, modifiedFields: ModifiedFields) => {
    await updateMutation.mutateAsync({ documentData, modifiedFields });
  };

  if (isLoading) {
    return <InlineLoader message="Loading project..." />;
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link to="/" className="inline-flex items-center text-gray-600 hover:text-gray-900">
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
      {/* Back link */}
      <Link to="/" className="inline-flex items-center text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Projects
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{data.project.name}</h1>
        <p className="text-gray-600">{data.project.email}</p>
      </div>

      {/* Pizza Tracker */}
      <PizzaTracker currentStage={data.project.stage} />

      {/* Document Checklist */}
      <DocumentChecklistWrapper 
        projectId={projectId!}
        initialData={data.documentData} 
        onSave={handleSave}
        isSaving={updateMutation.isPending}
      />
    </div>
  );
}

interface DocumentChecklistWrapperProps {
  projectId: string;
  initialData: DocumentData;
  onSave: (data: DocumentData, modifiedFields: ModifiedFields) => Promise<void>;
  isSaving: boolean;
}

function DocumentChecklistWrapper({ projectId, initialData, onSave, isSaving }: DocumentChecklistWrapperProps) {
  const {
    documentData,
    error,
    isSaving: isAutoSaving,
    toggleCategory,
    addDocument,
    updateDocumentName,
    updateDocumentStatus,
    setDocumentStatusOptimistic,
    removeDocument
  } = useDocumentData({
    initialData,
    onSave
  });

  return (
    <div className="space-y-4">
      {/* Save indicator */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Documents</h2>
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

      <DocumentChecklist
        projectId={projectId}
        documentData={documentData}
        onToggleCategory={toggleCategory}
        onAddDocument={addDocument}
        onUpdateDocumentName={updateDocumentName}
        onUpdateDocumentStatus={updateDocumentStatus}
        onRemoveDocument={removeDocument}
        onUploadSuccess={(categoryKey, docIndex) =>
          setDocumentStatusOptimistic(categoryKey, docIndex, 'pending_review')
        }
        clientMode={true}
      />
    </div>
  );
}
