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
  // Filing season. Null when neither the tax_year property nor the project
  // name says which season the project belongs to.
  taxYear?: number | null;
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

// Per-file review state (many files may hang off one document item)
export type FileReviewStatus = 'pending_review' | 'accepted' | 'needs_resubmission';

// Staged-on-volume -> HubSpot handoff state
export type FileTransferStatus = 'pending' | 'transferring' | 'synced' | 'failed';

// A file already submitted against a document item, as returned by the API
export interface SubmittedFile {
  id: string;
  categoryKey: string;
  documentIndex: number | null;
  filename: string;
  size: number | null;
  mimeType: string | null;
  uploadedByEmail: string | null;
  status: FileReviewStatus;
  uploadedAt: string;
  canDownload: boolean;
  // admin-only
  transferStatus?: FileTransferStatus;
  transferError?: string | null;
}

// Server-provided upload limits. Fetched once so the client can never disagree
// with the server about what is allowed.
export interface UploadConfig {
  maxFileSize: number;
  maxUploadMb: number;
  maxFilesPerUpload: number;
  allowedMimeTypes: string[];
  allowedExtensions: string[];
}

// Portal banner
export type BannerStyle = 'info' | 'warning' | 'success';

export interface PortalBanner {
  enabled: boolean;
  message: string;
  style: BannerStyle;
  cta: { label: string; url: string } | null;
  pages: 'all' | string[];
  updatedAt: string | null;
}

// Public shape (no `enabled` — a disabled banner is simply absent)
export interface PublicBanner {
  message: string;
  style: BannerStyle;
  cta: { label: string; url: string } | null;
  pages: 'all' | string[];
  updatedAt: string | null;
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

export const entityCategories: CategoryDefinition[] = [
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

// Notification preferences (user-facing)
export interface UserNotificationPreferences {
  passwordReset: boolean;
  portalRegistration: boolean;
  documentSubmission: boolean;
  weeklyUpdate: boolean;
}

// Upload digest frequency
export type UploadDigestFrequency = 'none' | 'daily' | 'weekly';

// Notification preferences (admin-facing)
export interface AdminNotificationPreferences {
  email: string;
  adminRegistration: boolean;
  adminDocumentSubmission: boolean;
  adminWeeklyUpdate: boolean;
  adminUploadDigest: UploadDigestFrequency;
}

// Registered portal user (for the admin registration audit)
export interface RegisteredUser {
  id: string;
  email: string;
  displayName: string | null;
  hubspotContactId: string | null;
  registeredAt: string;
  lastLoginAt: string | null;
}

// A client (project email) and their weekly-digest opt-in state
export interface WeeklyDigestClient {
  email: string;
  displayName: string | null;
  projectCount: number;
  actionNeeded: number;
  weeklyUpdate: boolean;
  registered: boolean;
}

// Schedule for the client weekly digest (one weekly send)
export interface WeeklyClientDigestSchedule {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  hour: number;
  minute: number;
  timezone: string;
}

// Schedule for the admin upload digest (daily time + weekly day)
export interface UploadDigestSchedule {
  hour: number;
  minute: number;
  weeklyDayOfWeek: number;
  timezone: string;
}

// Email template
export interface EmailTemplate {
  id: string;
  key: string;
  label: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Tax season ────────────────────────────────────────────────────────

// Which season the portal treats as current. A null year means unconfigured,
// and the client-facing filter stays off.
export interface TaxSeasonSettings {
  currentTaxYear: number | null;
  hidePriorYearProjects: boolean;
}

// Project counts per season, straight from HubSpot
export interface SeasonOverview {
  totalProjects: number;
  taxProjects: number;
  years: Array<{ year: number | null; count: number; fromNameOnly: number }>;
  missingTaxYear: number;
  backfillable: number;
}

// One project the rollover would create
export interface RolloverPlanItem {
  email: string;
  sourceProjectId: string;
  sourceName: string;
  sourceYear: number | null;
  newName: string;
  activeCategories: number;
  documents: number;
}

export interface RolloverSkip {
  email: string;
  projectName: string;
  reason: 'already_current' | 'no_tax_projects';
  detail: string;
}

// Dry-run result: exactly what a rollover would do
export interface RolloverPlan {
  targetYear: number;
  scannedProjects: number;
  clients: number;
  items: RolloverPlanItem[];
  skipped: RolloverSkip[];
}

export type RolloverStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface RolloverRunItem {
  email: string;
  sourceProjectId: string;
  sourceName: string;
  newProjectId?: string;
  newName: string;
  outcome: 'created' | 'failed';
  error?: string;
}

// Progress of a rollover, polled while it runs
export interface RolloverRun {
  status: RolloverStatus;
  targetYear: number | null;
  total: number;
  created: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
  startedBy: string | null;
  error: string | null;
  items: RolloverRunItem[];
}

export interface BackfillResult {
  dryRun: boolean;
  scanned: number;
  updated: number;
  failed: number;
  unresolved: number;
  changes: Array<{ projectId: string; name: string; year: number }>;
  errors: Array<{ projectId: string; error: string }>;
}

// Pizza tracker stages
export const pipelineStages = [
  { id: 'collecting', label: 'Collecting Documents' },
  { id: 'processing', label: 'Processing Return' },
  { id: 'submitted', label: 'Return Submitted' },
  { id: 'accepted', label: 'Return Accepted' }
] as const;
