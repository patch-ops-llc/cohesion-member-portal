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
  clientMode = false
}: DocumentChecklistProps) {
  const selectedSections = documentData._meta?.selectedSections || ['personal'];
  const showPersonal = selectedSections.includes('personal');
  const showEntity = selectedSections.includes('entity');

  return (
    <div className="space-y-6">
      {/* Personal categories */}
      {showPersonal && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="bg-primary-50 text-primary px-3 py-1 rounded-full text-sm mr-3">
              Personal
            </span>
            Personal Tax Documents
          </h3>
          <div className="space-y-4">
            {personalCategories.map((cat) => {
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="bg-accent-50 text-accent-600 px-3 py-1 rounded-full text-sm mr-3">
              Entity
            </span>
            Entity Tax Documents
          </h3>
          <div className="space-y-4">
            {entityCategories.map((cat) => {
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
