import { useState, useCallback, useRef, useEffect } from 'react';
import type { DocumentData, CategoryData, ModifiedFields, DocumentStatus } from '../types';

const DEBOUNCE_MS = 800;

interface UseDocumentDataOptions {
  initialData: DocumentData;
  onSave: (data: DocumentData, modifiedFields: ModifiedFields) => Promise<void>;
}

export function useDocumentData({ initialData, onSave }: UseDocumentDataOptions) {
  const [documentData, setDocumentData] = useState<DocumentData>(initialData);
  const [modifiedFields, setModifiedFields] = useState<ModifiedFields>({
    sections: false,
    categories: {},
    documents: {},
    statuses: {}
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasChangesRef = useRef(false);

  // Reset when initial data changes
  useEffect(() => {
    setDocumentData(initialData);
    setModifiedFields({
      sections: false,
      categories: {},
      documents: {},
      statuses: {}
    });
    hasChangesRef.current = false;
  }, [initialData]);

  // Auto-save with debounce
  const triggerSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (!hasChangesRef.current) return;

      setIsSaving(true);
      setError(null);

      try {
        await onSave(documentData, modifiedFields);
        hasChangesRef.current = false;
        setModifiedFields({
          sections: false,
          categories: {},
          documents: {},
          statuses: {}
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save changes');
      } finally {
        setIsSaving(false);
      }
    }, DEBOUNCE_MS);
  }, [documentData, modifiedFields, onSave]);

  // Toggle section (personal/entity)
  const toggleSection = useCallback((section: string) => {
    setDocumentData(prev => ({
      ...prev,
      _meta: {
        ...prev._meta,
        selectedSections: prev._meta.selectedSections.includes(section)
          ? prev._meta.selectedSections.filter(s => s !== section)
          : [...prev._meta.selectedSections, section]
      }
    }));
    setModifiedFields(prev => ({ ...prev, sections: true }));
    hasChangesRef.current = true;
    triggerSave();
  }, [triggerSave]);

  // Toggle category active/inactive
  const toggleCategory = useCallback((categoryKey: string) => {
    setDocumentData(prev => {
      const category = prev[categoryKey] as CategoryData | undefined;
      if (!category || 'selectedSections' in category) return prev;

      return {
        ...prev,
        [categoryKey]: {
          ...category,
          status: category.status === 'active' ? 'inactive' : 'active'
        }
      };
    });
    setModifiedFields(prev => ({
      ...prev,
      categories: { ...prev.categories, [categoryKey]: true }
    }));
    hasChangesRef.current = true;
    triggerSave();
  }, [triggerSave]);

  // Add document to category
  const addDocument = useCallback((categoryKey: string, documentName: string) => {
    setDocumentData(prev => {
      const category = prev[categoryKey] as CategoryData | undefined;
      if (!category || 'selectedSections' in category) return prev;

      return {
        ...prev,
        [categoryKey]: {
          ...category,
          documents: [
            ...category.documents,
            { name: documentName, status: 'not_submitted' as DocumentStatus }
          ]
        }
      };
    });
    setModifiedFields(prev => ({
      ...prev,
      categories: { ...prev.categories, [categoryKey]: true }
    }));
    hasChangesRef.current = true;
    triggerSave();
  }, [triggerSave]);

  // Update document name
  const updateDocumentName = useCallback((categoryKey: string, docIndex: number, name: string) => {
    setDocumentData(prev => {
      const category = prev[categoryKey] as CategoryData | undefined;
      if (!category || 'selectedSections' in category) return prev;

      const documents = [...category.documents];
      documents[docIndex] = { ...documents[docIndex], name };

      return {
        ...prev,
        [categoryKey]: { ...category, documents }
      };
    });
    setModifiedFields(prev => ({
      ...prev,
      documents: {
        ...prev.documents,
        [categoryKey]: { ...prev.documents[categoryKey], [docIndex]: true }
      }
    }));
    hasChangesRef.current = true;
    triggerSave();
  }, [triggerSave]);

  // Update document status
  const updateDocumentStatus = useCallback((categoryKey: string, docIndex: number, status: DocumentStatus) => {
    setDocumentData(prev => {
      const category = prev[categoryKey] as CategoryData | undefined;
      if (!category || 'selectedSections' in category) return prev;

      const documents = [...category.documents];
      documents[docIndex] = { ...documents[docIndex], status };

      return {
        ...prev,
        [categoryKey]: { ...category, documents }
      };
    });
    setModifiedFields(prev => ({
      ...prev,
      statuses: {
        ...prev.statuses,
        [categoryKey]: { ...prev.statuses[categoryKey], [docIndex]: true }
      }
    }));
    hasChangesRef.current = true;
    triggerSave();
  }, [triggerSave]);

  // Remove document
  const removeDocument = useCallback((categoryKey: string, docIndex: number) => {
    setDocumentData(prev => {
      const category = prev[categoryKey] as CategoryData | undefined;
      if (!category || 'selectedSections' in category) return prev;

      return {
        ...prev,
        [categoryKey]: {
          ...category,
          documents: category.documents.filter((_, i) => i !== docIndex)
        }
      };
    });
    setModifiedFields(prev => ({
      ...prev,
      categories: { ...prev.categories, [categoryKey]: true }
    }));
    hasChangesRef.current = true;
    triggerSave();
  }, [triggerSave]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    documentData,
    modifiedFields,
    isSaving,
    error,
    toggleSection,
    toggleCategory,
    addDocument,
    updateDocumentName,
    updateDocumentStatus,
    removeDocument
  };
}
