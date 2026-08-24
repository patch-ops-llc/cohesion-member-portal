import type { DocumentData, CategoryData } from '../services/hubspot';

export interface ModifiedFields {
  sections: boolean;
  categories: Record<string, boolean>;
  documents: Record<string, Record<number, boolean>>;
  statuses: Record<string, Record<number, boolean>>;
}

// Merge local changes with HubSpot data to prevent overwriting concurrent edits
export function mergeDocumentData(
  hubspotData: DocumentData,
  localData: DocumentData,
  modifiedFields: ModifiedFields
): DocumentData {
  const merged: DocumentData = { 
    _meta: { ...hubspotData._meta }
  };

  // Update _meta.selectedSections only if modified
  if (modifiedFields.sections && localData._meta) {
    merged._meta = { ...merged._meta, ...localData._meta };
  }

  // Copy over all existing categories from HubSpot
  for (const key of Object.keys(hubspotData)) {
    if (key !== '_meta') {
      merged[key] = { ...(hubspotData[key] as CategoryData) };
    }
  }

  // Process each category from local data
  for (const categoryKey of Object.keys(localData)) {
    if (categoryKey === '_meta') continue;

    const localCategory = localData[categoryKey] as CategoryData;
    const hubspotCategory = (hubspotData[categoryKey] as CategoryData) || {
      label: localCategory.label,
      status: 'inactive',
      documents: []
    };

    // If entire category was modified (toggled or docs added/removed)
    if (modifiedFields.categories[categoryKey]) {
      const documents = localCategory.documents.map((doc, index) => {
        const hubspotDoc = hubspotCategory.documents?.[index];
        const statusModified = modifiedFields.statuses[categoryKey]?.[index];

        return {
          name: doc.name,
          status: statusModified 
            ? doc.status 
            : (hubspotDoc?.status || doc.status)
        };
      });

      merged[categoryKey] = {
        label: localCategory.label,
        status: localCategory.status,
        documents
      };
    } 
    // If only specific documents/statuses were modified
    else if (modifiedFields.documents[categoryKey] || modifiedFields.statuses[categoryKey]) {
      const documents = localCategory.documents.map((doc, index) => {
        const hubspotDoc = hubspotCategory.documents?.[index];
        const docModified = modifiedFields.documents[categoryKey]?.[index];
        const statusModified = modifiedFields.statuses[categoryKey]?.[index];

        return {
          name: docModified ? doc.name : (hubspotDoc?.name || doc.name),
          status: statusModified ? doc.status : (hubspotDoc?.status || doc.status)
        };
      });

      merged[categoryKey] = {
        ...hubspotCategory,
        documents
      };
    }
    // If not modified, keep HubSpot data (already in merged)
  }

  return merged;
}

// Category definitions
export const personalCategories = [
  { key: 'w_2s', label: 'W-2s' },
  { key: '1099s', label: '1099s' },
  { key: 'schedule_c', label: 'Schedule C' },
  { key: 'schedule_e', label: 'Schedule E' },
  { key: 'property_expenses', label: 'Property Expenses' },
  { key: '1098s', label: '1098s' },
  { key: 'charitable_donations', label: 'Charitable Donations' },
  { key: 'livestock_sales_and_expenses', label: 'Livestock Sales and Expenses' },
  { key: 'foreign_bank_accounts', label: 'Foreign Bank Accounts' },
  { key: 'additional_documents', label: 'Additional Documents' },
  { key: 'previous_personal_tax_returns', label: 'Previous Personal Tax Returns' }
];

export const entityCategories = [
  { key: 'entity_income', label: 'Entity Income' },
  { key: 'entity_expenses', label: 'Entity Expenses' },
  { key: 'k_1s', label: 'K-1s' },
  { key: 'vehicle_mileage', label: 'Vehicle Mileage' },
  { key: 'balance_sheet', label: 'Balance Sheet' },
  { key: 'p_l', label: 'P&L' },
  { key: 'trial_balance', label: 'Trial Balance' },
  { key: 'general_ledger', label: 'General Ledger' },
  { key: 'additions_and_disposals', label: 'Additions and Disposals' },
  { key: 'business_operation_agreement', label: 'Business Operation Agreement' },
  { key: 'additional_documents', label: 'Additional Documents' },
  { key: 'previous_entity_tax_returns', label: 'Previous Entity Tax Returns' }
];

// Pipeline stage mappings
export const taxStageLabels: Record<string, string> = {
  "1742632656": "Collecting Documents",
  "1742632682": "Processing Return",
  "1742632683": "Processing Return",
  "1742632684": "Processing Return",
  "1742632685": "Processing Return",
  "1742632686": "Return Submitted",
  "1742632687": "Return Submitted",
  "1742632688": "Return Submitted",
  "1742632689": "Return Submitted",
  "1742632690": "Return Submitted",
  "1742632657": "Return Accepted"
};

export const taxStages = [
  { id: "collecting", label: "Collecting Documents" },
  { id: "processing", label: "Processing Return" },
  { id: "submitted", label: "Return Submitted" },
  { id: "accepted", label: "Return Accepted" }
];

// Get normalized stage for pizza tracker
export function getNormalizedStage(pipelineStageId: string): string {
  const stageLabel = taxStageLabels[pipelineStageId];
  if (!stageLabel) return 'collecting';
  
  if (stageLabel === 'Collecting Documents') return 'collecting';
  if (stageLabel === 'Processing Return') return 'processing';
  if (stageLabel === 'Return Submitted') return 'submitted';
  if (stageLabel === 'Return Accepted') return 'accepted';
  
  return 'collecting';
}

const ADVISORY_STAGE_IDS = new Set([
  'advisory_data_entry',
  'advisory_data_review',
  'advisory_prepare_reports',
  'advisory_deliver_reports'
]);

// Categories that only exist on advisory projects (tax shares general_ledger).
const ADVISORY_DOCUMENT_KEYS = new Set([
  'financial_statements',
  'accounts_receivable_aging',
  'bank_account_s_',
  'credit_card_account_s_',
  'line_of_credit',
  'loan_statement_s_',
  'payroll_report_s_',
  'sales_report_s_',
  'new_asset_purchase'
]);

export interface AdvisoryProjectSignals {
  name?: string | null;
  pipelineStage?: string | null;
  pipeline?: string | null;
  documentData?: DocumentData | null;
}

/**
 * Advisory work is staff-only. Clients should never see these in the portal.
 *
 * Pipeline/stage is the source of truth: a known tax stage always shows,
 * even if the record was created as advisory and still has that name or
 * leftover advisory document_data keys. Name/document_data are fallbacks
 * only when the stage is not a mapped tax stage.
 */
export function getAdvisoryHideReason(input: AdvisoryProjectSignals): string | null {
  const stage = (input.pipelineStage || '').trim();
  const stageLower = stage.toLowerCase();

  if (stage && taxStageLabels[stage]) {
    return null;
  }

  if (stageLower.includes('advisory') || ADVISORY_STAGE_IDS.has(stageLower)) {
    return `stage:${stage}`;
  }

  const pipeline = (input.pipeline || '').toLowerCase().trim();
  if (pipeline.includes('advisory')) {
    return `pipeline:${input.pipeline}`;
  }

  const name = (input.name || '').toLowerCase();
  if (
    name.includes('advisory') ||
    name.includes('financial report') ||
    name.includes('bookkeeping')
  ) {
    return `name:${input.name}`;
  }

  if (input.documentData) {
    for (const key of Object.keys(input.documentData)) {
      if (ADVISORY_DOCUMENT_KEYS.has(key)) {
        return `document_data:${key}`;
      }
    }
  }

  return null;
}

export function isAdvisoryProject(input: AdvisoryProjectSignals): boolean {
  return getAdvisoryHideReason(input) !== null;
}

