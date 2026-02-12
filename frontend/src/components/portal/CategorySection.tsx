import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, FolderOpen } from 'lucide-react';
import clsx from 'clsx';
import type { DocumentEntry, CategoryStatus, DocumentStatus } from '../../types';
import { DocumentItem } from './DocumentItem';

interface CategorySectionProps {
  projectId: string;
  categoryKey: string;
  label: string;
  status: CategoryStatus;
  documents: DocumentEntry[];
  onToggle: () => void;
  onAddDocument: (name: string) => void;
  onUpdateDocumentName: (docIndex: number, name: string) => void;
  onUpdateDocumentStatus: (docIndex: number, status: DocumentStatus) => void;
  onRemoveDocument: (docIndex: number) => void;
  /** Called when file upload succeeds - (docIndex) => void */
  onUploadSuccess?: (docIndex: number) => void;
  /** When true, client view: hide Add Document, pass clientMode to DocumentItem */
  clientMode?: boolean;
  isSaving?: boolean;
}

export function CategorySection({
  projectId,
  categoryKey,
  label,
  status,
  documents,
  onToggle,
  onAddDocument,
  onUpdateDocumentName,
  onUpdateDocumentStatus,
  onRemoveDocument,
  onUploadSuccess,
  clientMode = false,
  isSaving = false
}: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(status === 'active');
  const [isAddingDocument, setIsAddingDocument] = useState(false);
  const [newDocName, setNewDocName] = useState('');

  const isActive = status === 'active';

  // Count statuses
  const statusCounts = documents.reduce((acc, doc) => {
    acc[doc.status] = (acc[doc.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleAddDocument = () => {
    if (newDocName.trim()) {
      onAddDocument(newDocName.trim());
      setNewDocName('');
      setIsAddingDocument(false);
    }
  };

  return (
    <div className={clsx(
      'card overflow-hidden transition-all',
      !isActive && 'opacity-35'
    )}>
      {/* Header */}
      <div
        className={clsx(
          'flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors',
          isActive && 'bg-primary-50/50'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-400" />
          )}
          <FolderOpen className={clsx(
            'h-5 w-5',
            isActive ? 'text-primary' : 'text-gray-400'
          )} />
          <span className="font-medium text-gray-900">{label}</span>
          
          {/* Status badges */}
          {documents.length > 0 && (
            <div className="flex items-center space-x-1 ml-2">
              {statusCounts['accepted'] > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                  {statusCounts['accepted']} accepted
                </span>
              )}
              {statusCounts['pending_review'] > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
                  {statusCounts['pending_review']} pending
                </span>
              )}
              {(statusCounts['needs_resubmission'] || 0) + (statusCounts['missing_files'] || 0) > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
                  {(statusCounts['needs_resubmission'] || 0) + (statusCounts['missing_files'] || 0)} action needed
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {!clientMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className={clsx(
                'px-2 py-0.5 text-xs rounded-full',
                isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
              title={isActive ? 'Click to deactivate category' : 'Click to activate category'}
            >
              {isActive ? 'Active' : 'Inactive'}
            </button>
          )}
          <span className="text-sm text-gray-500">
            {documents.length} document{documents.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Documents */}
      {isExpanded && isActive && (
        <div className="border-t border-gray-200 p-4 space-y-3">
          {documents.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">
              No documents added yet
            </p>
          ) : (
            documents.map((doc, index) => (
              <DocumentItem
                key={index}
                projectId={projectId}
                categoryKey={categoryKey}
                documentIndex={index}
                document={doc}
                onUpdateName={(name) => onUpdateDocumentName(index, name)}
                onRemove={() => onRemoveDocument(index)}
                onUpdateStatus={!clientMode ? (status) => onUpdateDocumentStatus(index, status) : undefined}
                onUploadSuccess={onUploadSuccess ? () => onUploadSuccess(index) : undefined}
                clientMode={clientMode}
                isSaving={isSaving}
              />
            ))
          )}

          {/* Add document form */}
          {isAddingDocument ? (
            <div className="flex items-center space-x-2 mt-4">
              <input
                type="text"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                placeholder="Document name (e.g., John Doe W2)"
                className="input flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddDocument();
                  if (e.key === 'Escape') {
                    setIsAddingDocument(false);
                    setNewDocName('');
                  }
                }}
              />
              <button
                onClick={handleAddDocument}
                className="btn-primary"
                disabled={!newDocName.trim()}
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsAddingDocument(false);
                  setNewDocName('');
                }}
                className="btn-ghost"
              >
                Cancel
              </button>
            </div>
          ) : !clientMode ? (
            <button
              onClick={() => setIsAddingDocument(true)}
              className="flex items-center space-x-2 text-primary hover:text-primary-800 text-sm font-medium mt-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Document</span>
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
