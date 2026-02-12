// Document statuses
export type DocumentStatus = 
  | 'not_submitted'
  | 'pending_review'
  | 'needs_resubmission'
  | 'missing_files'
  | 'accepted';

// Category status
export type CategoryStatus = 'active' | 'inactive';

// Document entry in a category
export interface DocumentEntry {
  name: string;
  status: DocumentStatus;
}

// Category data structure
export interface CategoryData {
  label: string;
  status: CategoryStatus;
  documents: DocumentEntry[];
}

// Full document data structure from HubSpot
export interface DocumentData {
  _meta: {
    selectedSections: string[];
  };
  [key: string]: CategoryData | { selectedSections: string[] };
}

// Project pipeline stages
export type PipelineStage = 'collecting' | 'processing' | 'submitted' | 'accepted';

// Project as returned from API
export interface Project {
  id: string;
  name: string;
  email: string;
  stage: PipelineStage;
  documentData?: DocumentData;
  fileDirectory?: string;
}

// File upload record
export interface FileUpload {
  id: string;
  projectId: string;
  categoryKey: string;
  documentIndex: number | null;
  originalFilename: string;
  hubspotFileId: string | null;
  status: string;
  createdAt: string;
}

// User
export interface User {
  id: string;
  email: string;
}

// Auth state
export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
}

// Modified fields for merge tracking
export interface ModifiedFields {
  sections: boolean;
  categories: Record<string, boolean>;
  documents: Record<string, Record<number, boolean>>;
  statuses: Record<string, Record<number, boolean>>;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

// Category definitions
export interface CategoryDefinition {
  key: string;
  label: string;
}

export const personalCategories: CategoryDefinition[] = [
  { key: 'w_2s', label: 'W-2s' },
  { key: '1099s', label: '1099s' },
  { key: 'k_1s', label: 'K-1s' },
  { key: 'property_expenses', label: 'Property Expenses' },
  { key: '1098s', label: '1098s' },
  { key: 'charitable_donations', label: 'Charitable Donations' },
  { key: 'additional_documents', label: 'Additional Documents' },
  { key: 'livestock_sales_and_expenses', label: 'Livestock Sales and Expenses' },
  { key: 'foreign_bank_accounts', label: 'Foreign Bank Accounts' },
  { key: 'previous_personal_tax_returns', label: 'Previous Personal Tax Returns' }
];

export const entityCategories: CategoryDefinition[] = [
  { key: 'entity_income', label: 'Entity Income' },
  { key: 'entity_expenses', label: 'Entity Expenses' },
  { key: 'balance_sheet', label: 'Balance Sheet' },
  { key: 'p_l', label: 'P&L' },
  { key: 'trial_balance', label: 'Trial Balance' },
  { key: 'general_ledger', label: 'General Ledger' },
  { key: 'additions_and_disposals', label: 'Additions and Disposals' },
  { key: 'business_operation_agreement', label: 'Business Operation Agreement' },
  { key: 'previous_entity_tax_returns', label: 'Previous Entity Tax Returns' }
];

// Notification preferences (user-facing)
export interface UserNotificationPreferences {
  passwordReset: boolean;
  portalRegistration: boolean;
  documentSubmission: boolean;
  weeklyUpdate: boolean;
}

// Notification preferences (admin-facing)
export interface AdminNotificationPreferences {
  email: string;
  adminRegistration: boolean;
  adminDocumentSubmission: boolean;
  adminWeeklyUpdate: boolean;
}

// Pizza tracker stages
export const pipelineStages = [
  { id: 'collecting', label: 'Collecting Documents' },
  { id: 'processing', label: 'Processing Return' },
  { id: 'submitted', label: 'Return Submitted' },
  { id: 'accepted', label: 'Return Accepted' }
] as const;
