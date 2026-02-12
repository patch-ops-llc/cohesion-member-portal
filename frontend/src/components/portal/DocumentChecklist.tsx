import { personalCategories, entityCategories } from '../../types';
import type { DocumentData, CategoryData, DocumentStatus } from '../../types';
import { CategorySection } from './CategorySection';

interface DocumentChecklistProps {
  projectId: string;
  documentData: DocumentData;
  onToggleCategory: (categoryKey: string) => void;
  onAddDocument: (categoryKey: string, name: string) => void;
  onUpdateDocumentName: (categoryKey: string, docIndex: number, name: string) => void;
  onUpdateDocumentStatus: (categoryKey: string, docIndex: number, status: DocumentStatus) => void;
  onRemoveDocument: (categoryKey: string, docIndex: number) => void;
  /** Called when file upload succeeds - updates status to pending_review in real time */
  onUploadSuccess?: (categoryKey: string, docIndex: number) => void;
  /** When true, client view: hide add/edit/remove, show only upload */
  clientMode?: boolean;
  isSaving?: boolean;
}

export function DocumentChecklist({
  projectId,
  documentData,
  onToggleCategory,
  onAddDocument,
  onUpdateDocumentName,
  onUpdateDocumentStatus,
  onRemoveDocument,
  onUploadSuccess,
  clientMode = false,
  isSaving = false
}: DocumentChecklistProps) {
  const selectedSections = documentData._meta?.selectedSections || ['personal'];
  const showPersonal = selectedSections.includes('personal');
  const showEntity = selectedSections.includes('entity');

  // Sort: active categories first
  const sortByActive = (cats: typeof personalCategories) =>
    [...cats].sort((a, b) => {
      const aActive = (documentData[a.key] as CategoryData | undefined)?.status === 'active' ? 0 : 1;
      const bActive = (documentData[b.key] as CategoryData | undefined)?.status === 'active' ? 0 : 1;
      return aActive - bActive;
    });

  return (
    <div className="space-y-6">
      {/* Personal categories */}
      {showPersonal && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-3">Personal</h3>
          <div className="space-y-4">
            {sortByActive(personalCategories).map((cat) => {
              const categoryData = documentData[cat.key] as CategoryData | undefined;
              return (
                <CategorySection
                  key={cat.key}
                  projectId={projectId}
                  categoryKey={cat.key}
                  label={cat.label}
                  status={categoryData?.status || 'inactive'}
                  documents={categoryData?.documents || []}
                  onToggle={() => onToggleCategory(cat.key)}
                  onAddDocument={(name) => onAddDocument(cat.key, name)}
                  onUpdateDocumentName={(docIndex, name) => 
                    onUpdateDocumentName(cat.key, docIndex, name)
                  }
                  onUpdateDocumentStatus={(docIndex, status) =>
                    onUpdateDocumentStatus(cat.key, docIndex, status)
                  }
                  onRemoveDocument={(docIndex) => onRemoveDocument(cat.key, docIndex)}
                  onUploadSuccess={onUploadSuccess ? (docIndex) => onUploadSuccess(cat.key, docIndex) : undefined}
                  clientMode={clientMode}
                  isSaving={isSaving}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Entity categories */}
      {showEntity && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-3">Entity</h3>
          <div className="space-y-4">
            {sortByActive(entityCategories).map((cat) => {
              const categoryData = documentData[cat.key] as CategoryData | undefined;
              return (
                <CategorySection
                  key={cat.key}
                  projectId={projectId}
                  categoryKey={cat.key}
                  label={cat.label}
                  status={categoryData?.status || 'inactive'}
                  documents={categoryData?.documents || []}
                  onToggle={() => onToggleCategory(cat.key)}
                  onAddDocument={(name) => onAddDocument(cat.key, name)}
                  onUpdateDocumentName={(docIndex, name) =>
                    onUpdateDocumentName(cat.key, docIndex, name)
                  }
                  onUpdateDocumentStatus={(docIndex, status) =>
                    onUpdateDocumentStatus(cat.key, docIndex, status)
                  }
                  onRemoveDocument={(docIndex) => onRemoveDocument(cat.key, docIndex)}
                  onUploadSuccess={onUploadSuccess ? (docIndex) => onUploadSuccess(cat.key, docIndex) : undefined}
                  clientMode={clientMode}
                  isSaving={isSaving}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!showPersonal && !showEntity && (
        <div className="text-center py-12 text-gray-500">
          No document sections are currently active for this project.
        </div>
      )}
    </div>
  );
}
