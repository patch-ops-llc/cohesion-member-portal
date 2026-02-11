import { useState } from 'react';
import { FileText, Upload, Trash2, Edit2, Check, X } from 'lucide-react';
import clsx from 'clsx';
import type { DocumentEntry } from '../../types';
import { StatusBadge } from '../shared/StatusBadge';
import { FileUpload } from './FileUpload';

interface DocumentItemProps {
  projectId: string;
  categoryKey: string;
  documentIndex: number;
  document: DocumentEntry;
  onUpdateName: (name: string) => void;
  onRemove: () => void;
}

export function DocumentItem({
  projectId,
  categoryKey,
  documentIndex,
  document,
  onUpdateName,
  onRemove
}: DocumentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(document.name);
  const [showUpload, setShowUpload] = useState(false);

  const handleSaveName = () => {
    if (editName.trim() && editName !== document.name) {
      onUpdateName(editName.trim());
    }
    setIsEditing(false);
  };

  const needsUpload = document.status === 'not_submitted' || 
                      document.status === 'needs_resubmission' ||
                      document.status === 'missing_files';

  return (
    <div className={clsx(
      'flex items-center justify-between p-3 rounded-lg border transition-all',
      document.status === 'needs_resubmission' && 'border-red-300 bg-red-50',
      document.status === 'missing_files' && 'border-yellow-300 bg-yellow-50',
      document.status === 'accepted' && 'border-blue-200 bg-blue-50/50',
      document.status === 'pending_review' && 'border-amber-200 bg-amber-50/50',
      document.status === 'not_submitted' && 'border-gray-200 bg-white'
    )}>
      <div className="flex items-center space-x-3 flex-1 min-w-0">
        <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
        
        {isEditing ? (
          <div className="flex items-center space-x-2 flex-1">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="input py-1 flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
                if (e.key === 'Escape') {
                  setIsEditing(false);
                  setEditName(document.name);
                }
              }}
            />
            <button onClick={handleSaveName} className="p-1 text-green-600 hover:text-green-700">
              <Check className="h-4 w-4" />
            </button>
            <button 
              onClick={() => {
                setIsEditing(false);
                setEditName(document.name);
              }} 
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <span className="text-gray-900 truncate">{document.name}</span>
        )}
      </div>

      <div className="flex items-center space-x-3 ml-4">
        <StatusBadge status={document.status} size="sm" />
        
        <div className="flex items-center space-x-1">
          {!isEditing && (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                title="Edit name"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              
              {needsUpload && (
                <button
                  onClick={() => setShowUpload(!showUpload)}
                  className={clsx(
                    'p-1.5 rounded',
                    showUpload 
                      ? 'text-primary bg-primary-50' 
                      : 'text-gray-400 hover:text-primary'
                  )}
                  title="Upload file"
                >
                  <Upload className="h-4 w-4" />
                </button>
              )}
              
              <button
                onClick={onRemove}
                className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                title="Remove document"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="absolute right-0 mt-2 w-full max-w-md">
          <FileUpload
            projectId={projectId}
            categoryKey={categoryKey}
            documentIndex={documentIndex}
            onSuccess={() => setShowUpload(false)}
          />
        </div>
      )}
    </div>
  );
}
