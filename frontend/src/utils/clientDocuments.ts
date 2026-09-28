import type { CategoryData, DocumentEntry } from '../types';

export interface ClientDocumentRow {
  doc: DocumentEntry;
  index: number;
}

/**
 * Documents the client should see for a category.
 * A checked category with no named document still needs one upload slot.
 * The category label is that slot's name. A space-only name does not count.
 */
export function clientDocumentRows(
  category: Pick<CategoryData, 'status' | 'documents' | 'label'> | undefined,
  fallbackLabel: string
): ClientDocumentRow[] {
  const named = (category?.documents || [])
    .map((doc, index) => ({ doc, index }))
    .filter(({ doc }) => (doc.name || '').trim() !== '');

  if (named.length > 0) return named;
  if (category?.status !== 'active') return [];

  const name = (category.label || fallbackLabel).trim() || fallbackLabel;
  return [{ doc: { name, status: 'not_submitted' }, index: 0 }];
}
