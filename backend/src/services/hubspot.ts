import { Client } from '@hubspot/api-client';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { logger } from '../utils/logger';
import { getAdvisoryHideReason } from '../utils/documentData';
import { isVisibleForSeason, resolveTaxYear } from '../utils/taxYear';
import { getTaxSeasonSettings, type TaxSeasonSettings } from './settings';

const hubspotClient = new Client({ 
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN 
});

const CUSTOM_OBJECT_TYPE = process.env.HUBSPOT_CUSTOM_OBJECT_TYPE || '2-171216725';
const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID || '242796132';
/** HubSpot date property on p_client_projects (label: Documents Accepted Date) */
const DOCUMENTS_ACCEPTED_DATE_PROP =
  process.env.HUBSPOT_DOCUMENTS_ACCEPTED_DATE_PROPERTY || 'documents_accepted_date';
/** HubSpot number property on p_client_projects (label: Tax Year) */
export const TAX_YEAR_PROP = process.env.HUBSPOT_TAX_YEAR_PROPERTY || 'tax_year';

const BASE_PROJECT_PROPERTIES = [
  'client_project_name',
  'email',
  'hs_pipeline',
  'hs_pipeline_stage',
  'document_data',
  'file_directory',
  'cc_email',
  'hs_createdate'
];

// HubSpot rejects reads and writes that name a property the portal doesn't
// have, so `tax_year` is only ever included once we've confirmed it exists.
// Probed once per process; ensureTaxYearProperty() creates it at boot.
let taxYearProbe: Promise<boolean> | null = null;

async function taxYearPropertyExists(): Promise<boolean> {
  if (!taxYearProbe) {
    const probe = axios
      .get(`https://api.hubapi.com/crm/v3/properties/${CUSTOM_OBJECT_TYPE}/${TAX_YEAR_PROP}`, {
        headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` }
      })
      .then(() => true)
      .catch((error) => {
        if (axios.isAxiosError(error) && error.response?.status === 404) return false;

        // Only a definitive answer gets cached. A throttled or flaky probe
        // must not pin the property to "absent" for the life of the process —
        // that would silently drop tax years from every later write.
        taxYearProbe = null;
        logger.warn('Could not probe tax_year property; treating as absent for this call', {
          error: String(error)
        });
        return false;
      });

    taxYearProbe = probe;
    return probe;
  }
  return taxYearProbe;
}

/**
 * Property group to file Tax Year under. Custom-object group names vary by
 * portal (`p_client_projects_information` and similar), so read them rather
 * than guessing a name HubSpot would reject.
 */
async function resolveProjectPropertyGroup(): Promise<string> {
  const response = await axios.get<{ results?: Array<{ name: string }> }>(
    `https://api.hubapi.com/crm/v3/properties/${CUSTOM_OBJECT_TYPE}/groups`,
    { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
  );

  const groups = response.data?.results || [];
  const preferred = groups.find(g => g.name.endsWith('_information')) || groups[0];
  if (!preferred) {
    throw new Error('No property groups found on p_client_projects');
  }
  return preferred.name;
}

/**
 * Create the Tax Year property if the portal lacks it. Idempotent and additive,
 * so it's safe to run on every boot as well as from the provisioning script.
 */
export async function ensureTaxYearProperty(): Promise<{ existed: boolean }> {
  if (await taxYearPropertyExists()) return { existed: true };

  const groupName = await resolveProjectPropertyGroup();

  try {
    await axios.post(
      `https://api.hubapi.com/crm/v3/properties/${CUSTOM_OBJECT_TYPE}`,
      {
        name: TAX_YEAR_PROP,
        label: 'Tax Year',
        type: 'number',
        fieldType: 'number',
        groupName,
        description:
          'Filing season this project belongs to. Set by the portal when a season is rolled over.'
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    // 409 means the property is already there and the probe was simply wrong
    // (a flaky first probe). That's still a success, and the cache must be
    // corrected or every later write would drop the tax year.
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      taxYearProbe = Promise.resolve(true);
      return { existed: true };
    }
    taxYearProbe = null;
    throw error;
  }

  taxYearProbe = Promise.resolve(true);
  logger.info('Created tax_year property on p_client_projects', { property: TAX_YEAR_PROP, groupName });
  return { existed: false };
}

/** Property list for project reads, including tax_year only when it exists. */
async function projectProperties(): Promise<string[]> {
  return (await taxYearPropertyExists())
    ? [...BASE_PROJECT_PROPERTIES, TAX_YEAR_PROP]
    : [...BASE_PROJECT_PROPERTIES];
}

// Build the canonical HubSpot File Manager URL for a folder.
// HubSpot expects: https://app-na2.hubspot.com/files/<portalId>/?folderId=<folderId>
export function buildFolderUrl(folderId: string | number): string {
  return `https://app-na2.hubspot.com/files/${HUBSPOT_PORTAL_ID}/?folderId=${folderId}`;
}

// Pull the folder id out of any stored file_directory value, handling both the
// correct format (…?folderId=<id>) and the legacy/malformed format
// (https://app.hubspot.com/files/<id>).
export function extractFolderId(fileDirectory?: string | null): string | null {
  if (!fileDirectory) return null;
  const withParam = fileDirectory.match(/folderId=(\d+)/);
  if (withParam) return withParam[1];
  const legacy = fileDirectory.match(/\/files\/(\d+)\/?$/);
  if (legacy) return legacy[1];
  return null;
}

// Normalize a possibly-malformed file_directory into the canonical URL.
// Returns null when no folder id can be recovered.
export function normalizeFolderUrl(fileDirectory?: string | null): string | null {
  const folderId = extractFolderId(fileDirectory);
  return folderId ? buildFolderUrl(folderId) : null;
}

export interface ProjectProperties {
  client_project_name: string;
  email: string;
  hs_pipeline?: string;
  hs_pipeline_stage: string;
  document_data: string;
  file_directory?: string;
  cc_email?: string;
  hs_createdate?: string;
  /** Number property, but HubSpot returns every value as a string. */
  tax_year?: string;
}

export interface Project {
  id: string;
  properties: ProjectProperties;
}

export interface DocumentEntry {
  name: string;
  status: 'not_submitted' | 'pending_review' | 'needs_resubmission' | 'missing_files' | 'accepted';
}

export interface CategoryData {
  label: string;
  status: 'active' | 'inactive';
  documents: DocumentEntry[];
}

export interface DocumentData {
  _meta: {
    selectedSections: string[];
  };
  [key: string]: CategoryData | { selectedSections: string[] };
}

// Get a single project by ID
export async function getProject(projectId: string): Promise<Project> {
  try {
    const response = await hubspotClient.crm.objects.basicApi.getById(
      CUSTOM_OBJECT_TYPE,
      projectId,
      await projectProperties()
    );
    return {
      id: response.id,
      properties: response.properties as unknown as ProjectProperties
    };
  } catch (error) {
    logger.error('Failed to get project from HubSpot', { projectId, error: String(error) });
    throw error;
  }
}

// Get all projects for a user by email
export async function getProjectsByEmail(email: string): Promise<Project[]> {
  const allProjects: Project[] = [];
  let after: string | undefined;
  const properties = await projectProperties();

  try {
    do {
      const response = await hubspotClient.crm.objects.basicApi.getPage(
        CUSTOM_OBJECT_TYPE,
        100,
        after,
        properties
      );

      const matching = response.results.filter(
        p => p.properties.email?.toLowerCase().trim() === email.toLowerCase().trim()
      );
      
      allProjects.push(...matching.map(p => ({
        id: p.id,
        properties: p.properties as unknown as ProjectProperties
      })));

      after = response.paging?.next?.after;
    } while (after);

    logger.info(`Found ${allProjects.length} projects for email`, { email });
    return allProjects;
  } catch (error) {
    logger.error('Failed to get projects by email', { email, error: String(error) });
    throw error;
  }
}

// Get all projects (for admin) — paginates through all HubSpot pages
export async function getAllProjects(): Promise<{ projects: Project[] }> {
  const allProjects: Project[] = [];
  let after: string | undefined;
  const properties = await projectProperties();

  try {
    do {
      const response = await hubspotClient.crm.objects.basicApi.getPage(
        CUSTOM_OBJECT_TYPE,
        100,
        after,
        properties
      );

      allProjects.push(...response.results.map(p => ({
        id: p.id,
        properties: p.properties as unknown as ProjectProperties
      })));

      after = response.paging?.next?.after;
    } while (after);

    logger.info(`Fetched all projects from HubSpot`, { count: allProjects.length });
    return { projects: allProjects };
  } catch (error) {
    logger.error('Failed to get all projects', { error: String(error) });
    throw error;
  }
}

/**
 * Documents that block "all accepted" completion.
 * Active categories with zero documents are ignored (common when a category
 * is toggled on as a placeholder with no named docs yet).
 */
export function getDocumentAcceptanceBlockers(documentData: DocumentData): string[] {
  const blockers: string[] = [];
  let namedDocCount = 0;

  for (const key of Object.keys(documentData)) {
    if (key === '_meta') continue;

    const category = documentData[key] as CategoryData;
    if (!category || category.status !== 'active') continue;

    const docs = (category.documents || []).filter((doc) => (doc.name || '').trim() !== '');
    if (docs.length === 0) continue;

    for (const doc of docs) {
      namedDocCount += 1;
      if (doc.status !== 'accepted') {
        blockers.push(`${key}: "${doc.name}" (${doc.status || 'unknown'})`);
      }
    }
  }

  if (namedDocCount === 0) {
    blockers.push('no_named_documents');
  }

  return blockers;
}

/**
 * True when every named document in every active category is status "accepted".
 * Empty active categories do not block completion.
 */
export function areAllActiveDocumentsAccepted(documentData: DocumentData): boolean {
  return getDocumentAcceptanceBlockers(documentData).length === 0;
}

/** Calendar date in America/Chicago as HubSpot date property value (YYYY-MM-DD). */
export function toHubSpotDateCentral(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Last time document_data (checklist) was edited, as a HubSpot date (YYYY-MM-DD Central).
 * Falls back to hs_lastmodifieddate, then today.
 */
export async function getLastChecklistEditDate(projectId: string): Promise<string> {
  try {
    const response = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/${CUSTOM_OBJECT_TYPE}/${projectId}`,
      {
        headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` },
        params: {
          properties: 'hs_lastmodifieddate',
          propertiesWithHistory: 'document_data'
        }
      }
    );

    const history = response.data?.propertiesWithHistory?.document_data;
    if (Array.isArray(history) && history.length > 0 && history[0]?.timestamp) {
      return toHubSpotDateCentral(new Date(history[0].timestamp));
    }

    const lastModified = response.data?.properties?.hs_lastmodifieddate;
    if (lastModified) {
      return toHubSpotDateCentral(new Date(lastModified));
    }
  } catch (error) {
    logger.warn('Could not resolve last checklist edit date; using today', {
      projectId,
      error: String(error)
    });
  }

  return toHubSpotDateCentral();
}

async function writeDocumentsAcceptedDate(projectId: string, value: string): Promise<void> {
  await hubspotClient.crm.objects.basicApi.update(
    CUSTOM_OBJECT_TYPE,
    projectId,
    { properties: { [DOCUMENTS_ACCEPTED_DATE_PROP]: value } }
  );
}

/**
 * Enforce Documents Accepted Date from current checklist state.
 * - All accepted + empty date → set to last checklist edit date (never leave empty)
 * - Not all accepted → clear date
 * Returns the date value after sync (null if cleared / not applicable).
 */
export async function syncDocumentsAcceptedDate(
  projectId: string,
  documentData: DocumentData,
  options: { existingDate?: string | null; editDate?: string } = {}
): Promise<string | null> {
  const blockers = getDocumentAcceptanceBlockers(documentData);
  const allAccepted = blockers.length === 0;

  let existing = options.existingDate;
  if (existing === undefined) {
    try {
      const current = await hubspotClient.crm.objects.basicApi.getById(
        CUSTOM_OBJECT_TYPE,
        projectId,
        [DOCUMENTS_ACCEPTED_DATE_PROP]
      );
      existing = current.properties?.[DOCUMENTS_ACCEPTED_DATE_PROP] || null;
    } catch (error) {
      logger.warn('Could not read Documents Accepted Date', {
        projectId,
        error: String(error)
      });
      existing = null;
    }
  }

  try {
    if (allAccepted) {
      if (existing) {
        return existing;
      }

      const dateValue = options.editDate || (await getLastChecklistEditDate(projectId));
      await writeDocumentsAcceptedDate(projectId, dateValue);
      logger.info('Backfilled Documents Accepted Date', {
        projectId,
        documentsAcceptedDate: dateValue,
        source: options.editDate ? 'current_edit' : 'last_checklist_edit'
      });
      return dateValue;
    }

    if (existing) {
      await writeDocumentsAcceptedDate(projectId, '');
      logger.info('Cleared Documents Accepted Date (checklist incomplete)', {
        projectId,
        acceptanceBlockers: blockers.slice(0, 10)
      });
    }
    return null;
  } catch (error) {
    logger.warn('Documents Accepted Date sync failed', {
      projectId,
      allAccepted,
      error: String(error)
    });
    return existing || null;
  }
}

// Update document_data field, and sync Documents Accepted Date when all active docs are accepted
export async function updateDocumentData(projectId: string, documentData: DocumentData): Promise<void> {
  const documentDataJson = JSON.stringify(documentData);

  try {
    const blockers = getDocumentAcceptanceBlockers(documentData);
    const allAccepted = blockers.length === 0;

    await hubspotClient.crm.objects.basicApi.update(
      CUSTOM_OBJECT_TYPE,
      projectId,
      { properties: { document_data: documentDataJson } }
    );

    // Current card/admin edit is the latest checklist edit when all are accepted
    const documentsAcceptedDate = await syncDocumentsAcceptedDate(projectId, documentData, {
      editDate: allAccepted ? toHubSpotDateCentral() : undefined
    });

    logger.info('Updated document_data in HubSpot', {
      projectId,
      allDocumentsAccepted: allAccepted,
      documentsAcceptedDate,
      acceptanceBlockers: allAccepted ? undefined : blockers.slice(0, 10)
    });
  } catch (error) {
    logger.error('Failed to update document_data', { projectId, error: String(error) });
    throw error;
  }
}

// Upload file to HubSpot File Manager.
//
// Streams from disk rather than buffering: at a 50 MB ceiling, reading the
// whole file into memory would be a per-upload memory spike on a small dyno.
// maxBodyLength/maxContentLength are set explicitly because axios defaults to
// a 10 MB body cap, which silently breaks large uploads.
export async function uploadFileToHubSpot(
  filePath: string,
  fileName: string,
  folderId?: string,
  contentType?: string
): Promise<string> {
  try {
    const form = new FormData();
    // The filename MUST be set explicitly. form-data otherwise derives it from
    // the read stream's path, which is multer's random temp name with no
    // extension — HubSpot then stores the file as "3604d08cfc65…" of unknown
    // type, and downloads arrive with no extension and an unopenable name.
    form.append('file', fs.createReadStream(filePath), {
      filename: fileName,
      ...(contentType ? { contentType } : {})
    });
    form.append('options', JSON.stringify({ access: 'PUBLIC_INDEXABLE' }));
    if (folderId) {
      form.append('folderId', folderId);
    }
    form.append('name', fileName);

    const response = await axios.post(
      'https://api.hubapi.com/files/v3/files',
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
          ...form.getHeaders()
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    logger.info('Uploaded file to HubSpot', { fileId: response.data.id, fileName });
    return response.data.id;
  } catch (error) {
    logger.error('Failed to upload file to HubSpot', { fileName, error: String(error) });
    throw error;
  }
}

// Resolve a file's current download URL from HubSpot.
//
// Looked up on demand rather than cached alongside the file id: HubSpot's URLs
// embed the folder path, so a rename or folder move in the CRM would silently
// invalidate a stored copy and break downloads. This also means files uploaded
// before this feature existed are downloadable with no backfill.
export async function getFileUrl(fileId: string): Promise<string | null> {
  try {
    const response = await axios.get<{ url?: string }>(
      `https://api.hubapi.com/files/v3/files/${fileId}`,
      { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
    );
    return response.data.url ?? null;
  } catch (error) {
    logger.error('Failed to resolve HubSpot file URL', { fileId, error: String(error) });
    return null;
  }
}

// Archive a file in HubSpot File Manager. Used when a client removes an upload
// before review — best-effort, since losing the remote copy must not block the
// local delete.
export async function deleteFileFromHubSpot(fileId: string): Promise<void> {
  try {
    await axios.delete(`https://api.hubapi.com/files/v3/files/${fileId}`, {
      headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` }
    });
    logger.info('Deleted file from HubSpot', { fileId });
  } catch (error) {
    logger.warn('Failed to delete file from HubSpot (continuing)', {
      fileId,
      error: String(error)
    });
  }
}

// Create note with file attachment
export async function createNoteWithAttachment(
  projectId: string,
  fileId: string,
  noteBody: string
): Promise<string> {
  try {
    const response = await hubspotClient.crm.objects.notes.basicApi.create({
      properties: {
        hs_timestamp: new Date().toISOString(),
        hs_note_body: noteBody,
        hs_attachment_ids: fileId
      },
      associations: [
        {
          to: { id: projectId },
          types: [
            {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              associationCategory: 'USER_DEFINED' as any,
              associationTypeId: 6
            }
          ]
        }
      ]
    });

    logger.info('Created note with attachment', { noteId: response.id, projectId });
    return response.id;
  } catch (error) {
    logger.error('Failed to create note', { projectId, fileId, error: String(error) });
    throw error;
  }
}

// Get or create project folder
export async function getOrCreateProjectFolder(
  projectId: string,
  projectName: string,
  email: string
): Promise<string> {
  try {
    const project = await getProject(projectId);
    
    // Check if folder already exists. Handles both the correct format and the
    // legacy malformed format so we never create a duplicate folder.
    const existingFolderId = extractFolderId(project.properties.file_directory);
    if (existingFolderId) {
      // Repair the stored URL in place if it isn't in the canonical format.
      const canonicalUrl = buildFolderUrl(existingFolderId);
      if (project.properties.file_directory !== canonicalUrl) {
        try {
          await hubspotClient.crm.objects.basicApi.update(
            CUSTOM_OBJECT_TYPE,
            projectId,
            { properties: { file_directory: canonicalUrl } }
          );
          logger.info('Repaired malformed file_directory', { projectId, folderId: existingFolderId });
        } catch (repairError) {
          logger.warn('Failed to repair file_directory (continuing)', { projectId, error: String(repairError) });
        }
      }
      logger.debug('Using existing folder', { folderId: existingFolderId });
      return existingFolderId;
    }

    // Create new folder
    const folderName = `${email}_${projectName}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    
    const response = await axios.post(
      'https://api.hubapi.com/files/v3/folders',
      { name: folderName },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const folderId = response.data.id;
    const folderUrl = buildFolderUrl(folderId);

    // Update project with folder URL
    await hubspotClient.crm.objects.basicApi.update(
      CUSTOM_OBJECT_TYPE,
      projectId,
      { properties: { file_directory: folderUrl } }
    );

    logger.info('Created new folder', { folderId, projectId });
    return folderId;
  } catch (error) {
    logger.error('Failed to get/create folder', { projectId, error: String(error) });
    throw error;
  }
}

export interface ContactInfo {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createDate?: string;
  lastModifiedDate?: string;
}

// Search for contact by email (validates user is in HubSpot CRM)
export async function findContactByEmail(email: string): Promise<ContactInfo | null> {
  try {
    const response = await axios.post<{
      results?: Array<{ id: string; properties: { email?: string; firstname?: string; lastname?: string } }>;
    }>(
      'https://api.hubapi.com/crm/v3/objects/contacts/search',
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: email.toLowerCase().trim()
              }
            ]
          }
        ],
        properties: ['email', 'hs_object_id', 'firstname', 'lastname'],
        limit: 1
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data?.results && response.data.results.length > 0) {
      const contact = response.data.results[0];
      const props = contact.properties;
      return {
        id: contact.id,
        email: props?.email || email,
        firstName: props?.firstname?.trim() || undefined,
        lastName: props?.lastname?.trim() || undefined
      };
    }
    return null;
  } catch (error) {
    logger.error('Failed to search contact in HubSpot', { email, error: String(error) });
    throw error;
  }
}

// Validate email: must exist in HubSpot (contact OR have projects)
// Uses both: contact in CRM and projects - contact is primary for "known user"
export async function validateEmailInHubSpot(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  // Check 1: Contact exists in HubSpot
  const contact = await findContactByEmail(normalizedEmail);
  if (contact) return true;
  // Check 2: Has projects in p_client_projects (fallback for clients not yet as contacts)
  const projects = await getProjectsByEmail(normalizedEmail);
  return projects.length > 0;
}

// Get all contacts (for admin)
export async function getAllContacts(limit: number = 100, after?: string): Promise<{
  contacts: ContactInfo[];
  paging?: { next?: { after: string } };
}> {
  try {
    const response = await hubspotClient.crm.contacts.basicApi.getPage(
      limit,
      after,
      ['email', 'firstname', 'lastname', 'hs_object_id', 'createdate', 'lastmodifieddate']
    );

    return {
      contacts: response.results
        .filter(c => c.properties.email) // skip contacts without email
        .map(c => ({
          id: c.id,
          email: c.properties.email!,
          firstName: c.properties.firstname?.trim() || undefined,
          lastName: c.properties.lastname?.trim() || undefined,
          createDate: c.properties.createdate || undefined,
          lastModifiedDate: c.properties.lastmodifieddate || undefined,
        })),
      paging: response.paging
    };
  } catch (error) {
    logger.error('Failed to get all contacts', { error: String(error) });
    throw error;
  }
}

// Batch-fetch contacts by their HubSpot IDs (chunks of 100).
// Returns a map keyed by contact id for quick name/email lookups.
export async function getContactsByIds(ids: string[]): Promise<Map<string, ContactInfo>> {
  const result = new Map<string, ContactInfo>();
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return result;

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    try {
      const response = await axios.post<{
        results?: Array<{ id: string; properties: Record<string, string> }>;
      }>(
        'https://api.hubapi.com/crm/v3/objects/contacts/batch/read',
        {
          properties: ['email', 'firstname', 'lastname'],
          inputs: chunk.map(id => ({ id }))
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      for (const c of response.data?.results || []) {
        result.set(c.id, {
          id: c.id,
          email: c.properties.email || '',
          firstName: c.properties.firstname?.trim() || undefined,
          lastName: c.properties.lastname?.trim() || undefined
        });
      }
    } catch (error) {
      logger.warn('Failed to batch-read contacts (continuing)', { count: chunk.length, error: String(error) });
    }
  }

  return result;
}

// Search contacts by query string (uses HubSpot search API)
export async function searchContacts(query: string, limit: number = 10): Promise<ContactInfo[]> {
  try {
    const response = await axios.post<{
      results?: Array<{
        id: string;
        properties: {
          email?: string;
          firstname?: string;
          lastname?: string;
          createdate?: string;
          lastmodifieddate?: string;
        };
      }>;
    }>(
      'https://api.hubapi.com/crm/v3/objects/contacts/search',
      {
        query,
        properties: ['email', 'firstname', 'lastname', 'createdate', 'lastmodifieddate'],
        limit
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return (response.data?.results || [])
      .filter(c => c.properties.email)
      .map(c => ({
        id: c.id,
        email: c.properties.email!,
        firstName: c.properties.firstname?.trim() || undefined,
        lastName: c.properties.lastname?.trim() || undefined,
        createDate: c.properties.createdate || undefined,
        lastModifiedDate: c.properties.lastmodifieddate || undefined,
      }));
  } catch (error) {
    logger.error('Failed to search contacts in HubSpot', { query, error: String(error) });
    throw error;
  }
}

// Create a new p_client_projects record in HubSpot
export async function createProject(properties: {
  client_project_name: string;
  email: string;
  tax_year?: number | null;
  cc_email?: string | null;
  documentData?: DocumentData;
  pipeline?: string | null;
  pipelineStage?: string | null;
}): Promise<Project> {
  try {
    const documentData: DocumentData = properties.documentData || {
      _meta: { selectedSections: ['personal'] }
    };

    const payload: Record<string, string> = {
      client_project_name: properties.client_project_name,
      email: properties.email.toLowerCase().trim(),
      document_data: JSON.stringify(documentData)
    };

    if (properties.cc_email) payload.cc_email = properties.cc_email;
    if (properties.pipeline) payload.hs_pipeline = properties.pipeline;
    if (properties.pipelineStage) payload.hs_pipeline_stage = properties.pipelineStage;

    if (properties.tax_year) {
      // Refuse rather than silently drop it: the tax year decides whether the
      // client can see this project, and a caller told to expect it stored
      // would otherwise report success on a project nobody can find.
      if (!(await taxYearPropertyExists())) {
        throw new Error(
          `Cannot set tax year: HubSpot property "${TAX_YEAR_PROP}" is unavailable on p_client_projects`
        );
      }
      payload[TAX_YEAR_PROP] = String(properties.tax_year);
    }

    const response = await hubspotClient.crm.objects.basicApi.create(
      CUSTOM_OBJECT_TYPE,
      {
        properties: payload,
        associations: []
      }
    );

    logger.info('Created project in HubSpot', {
      projectId: response.id,
      name: properties.client_project_name,
      taxYear: properties.tax_year ?? null
    });

    return {
      id: response.id,
      properties: response.properties as unknown as ProjectProperties
    };
  } catch (error) {
    logger.error('Failed to create project in HubSpot', { properties, error: String(error) });
    throw error;
  }
}

// Associate a project with a HubSpot contact
export async function associateProjectWithContact(projectId: string, contactId: string): Promise<void> {
  try {
    await axios.put(
      `https://api.hubapi.com/crm/v4/objects/${CUSTOM_OBJECT_TYPE}/${projectId}/associations/contacts/${contactId}`,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 279 }],
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    logger.info('Associated project with contact', { projectId, contactId });
  } catch (error) {
    logger.warn('Failed to associate project with contact (non-fatal)', { projectId, contactId, error: String(error) });
  }
}

// Get projects associated with a contact via CRM associations
export async function getProjectsByContactAssociation(contactId: string): Promise<Project[]> {
  try {
    const response = await axios.get<{
      results?: Array<{ toObjectId: number }>;
      paging?: { next?: { after: string } };
    }>(
      `https://api.hubapi.com/crm/v4/objects/contacts/${contactId}/associations/${CUSTOM_OBJECT_TYPE}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`
        }
      }
    );

    const projectIds = response.data?.results?.map(r => String(r.toObjectId)) || [];
    if (projectIds.length === 0) return [];

    // Batch-fetch project details (HubSpot batch read supports up to 100)
    const batchResponse = await axios.post<{
      results?: Array<{ id: string; properties: Record<string, string> }>;
    }>(
      `https://api.hubapi.com/crm/v3/objects/${CUSTOM_OBJECT_TYPE}/batch/read`,
      {
        properties: await projectProperties(),
        inputs: projectIds.map(id => ({ id }))
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const projects = (batchResponse.data?.results || []).map(p => ({
      id: p.id,
      properties: p.properties as unknown as ProjectProperties
    }));

    logger.info(`Found ${projects.length} projects via contact association`, { contactId });
    return projects;
  } catch (error) {
    logger.error('Failed to get projects by contact association', { contactId, error: String(error) });
    return [];
  }
}

export function projectAdvisorySignals(project: Project) {
  return {
    name: project.properties.client_project_name,
    pipelineStage: project.properties.hs_pipeline_stage,
    pipeline: project.properties.hs_pipeline,
    documentData: parseDocumentData(project.properties.document_data)
  };
}

export function projectIsAdvisory(project: Project): boolean {
  return getAdvisoryHideReason(projectAdvisorySignals(project)) !== null;
}

/** Raw tax_year value as HubSpot returned it, honouring the configured name. */
function rawTaxYear(project: Project): string | undefined {
  return (project.properties as unknown as Record<string, string | undefined>)[TAX_YEAR_PROP];
}

/** True when the project carries an explicit tax_year, not just a year in its name. */
export function hasExplicitTaxYear(project: Project): boolean {
  const raw = rawTaxYear(project);
  return raw !== undefined && raw !== null && raw !== '';
}

/**
 * Season a project belongs to: the tax_year property when set, otherwise the
 * year read out of its name. Null when neither is available.
 */
export function getProjectTaxYear(project: Project): number | null {
  return resolveTaxYear({
    taxYear: rawTaxYear(project),
    name: project.properties.client_project_name
  });
}

/** Stamp tax_year on an existing project (used by the backfill). */
export async function updateProjectTaxYear(projectId: string, taxYear: number): Promise<void> {
  if (!(await taxYearPropertyExists())) {
    throw new Error(`HubSpot property "${TAX_YEAR_PROP}" does not exist on p_client_projects`);
  }

  await hubspotClient.crm.objects.basicApi.update(CUSTOM_OBJECT_TYPE, projectId, {
    properties: { [TAX_YEAR_PROP]: String(taxYear) }
  });

  logger.info('Set project tax year', { projectId, taxYear });
}

/**
 * True when the given season settings allow a client to see this project.
 * Takes the settings so callers looping over many projects read them once.
 */
export function projectVisibleInSeason(project: Project, season: TaxSeasonSettings): boolean {
  return isVisibleForSeason(
    getProjectTaxYear(project),
    season.currentTaxYear,
    season.hidePriorYearProjects
  );
}

/** Single-project convenience wrapper that loads the season itself. */
export async function projectIsInCurrentSeason(project: Project): Promise<boolean> {
  return projectVisibleInSeason(project, await getTaxSeasonSettings());
}

// Combine email-matched and association-matched projects (deduplicated)
export async function getProjectsForUser(email: string, contactId: string | null): Promise<Project[]> {
  const [emailProjects, assocProjects, season] = await Promise.all([
    getProjectsByEmail(email),
    contactId ? getProjectsByContactAssociation(contactId) : Promise.resolve([]),
    getTaxSeasonSettings()
  ]);

  const projectMap = new Map<string, Project>();
  for (const p of emailProjects) projectMap.set(p.id, p);
  for (const p of assocProjects) {
    if (!projectMap.has(p.id)) projectMap.set(p.id, p);
  }

  const visible: Project[] = [];
  let hiddenAdvisory = 0;
  let hiddenPriorSeason = 0;
  for (const project of projectMap.values()) {
    const reason = getAdvisoryHideReason(projectAdvisorySignals(project));
    if (reason) {
      hiddenAdvisory += 1;
      logger.info('Hiding non-tax project from client portal', {
        email,
        projectId: project.id,
        name: project.properties.client_project_name,
        stage: project.properties.hs_pipeline_stage,
        pipeline: project.properties.hs_pipeline,
        reason
      });
      continue;
    }

    if (!projectVisibleInSeason(project, season)) {
      hiddenPriorSeason += 1;
      logger.info('Hiding prior-season project from client portal', {
        email,
        projectId: project.id,
        name: project.properties.client_project_name,
        projectYear: getProjectTaxYear(project),
        currentTaxYear: season.currentTaxYear
      });
      continue;
    }

    visible.push(project);
  }

  logger.info('Combined project lookup', {
    email,
    contactId,
    emailCount: emailProjects.length,
    assocCount: assocProjects.length,
    totalUnique: projectMap.size,
    hiddenAdvisory,
    hiddenPriorSeason,
    clientVisible: visible.length
  });

  return visible;
}

// Check if a user has access to a specific project (by email match or association)
export async function userHasProjectAccess(
  projectId: string,
  email: string,
  contactId: string | null
): Promise<boolean> {
  const project = await getProject(projectId);

  if (projectIsAdvisory(project)) {
    logger.info('Denied client access to advisory project', { projectId, email });
    return false;
  }

  // Prior-season projects are hidden from the list, so honour that here too —
  // otherwise an old bookmark still reaches a project the portal won't show.
  if (!(await projectIsInCurrentSeason(project))) {
    logger.info('Denied client access to prior-season project', {
      projectId,
      email,
      projectYear: getProjectTaxYear(project)
    });
    return false;
  }

  // Check 1: email match
  if (project.properties.email?.toLowerCase().trim() === email.toLowerCase().trim()) {
    return true;
  }

  // Check 2: contact association
  if (contactId) {
    try {
      const response = await axios.get<{
        results?: Array<{ toObjectId: number }>;
      }>(
        `https://api.hubapi.com/crm/v4/objects/contacts/${contactId}/associations/${CUSTOM_OBJECT_TYPE}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`
          }
        }
      );
      const associatedIds = response.data?.results?.map(r => String(r.toObjectId)) || [];
      if (associatedIds.includes(projectId)) return true;
    } catch (error) {
      logger.warn('Failed to check contact association for access', { projectId, contactId, error: String(error) });
    }
  }

  return false;
}

// Get all contacts associated with a project
export async function getAssociatedContacts(projectId: string): Promise<ContactInfo[]> {
  try {
    const response = await axios.get<{
      results?: Array<{ toObjectId: number }>;
    }>(
      `https://api.hubapi.com/crm/v4/objects/${CUSTOM_OBJECT_TYPE}/${projectId}/associations/contacts`,
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`
        }
      }
    );

    const contactIds = response.data?.results?.map(r => String(r.toObjectId)) || [];
    if (contactIds.length === 0) return [];

    const batchResponse = await axios.post<{
      results?: Array<{ id: string; properties: Record<string, string> }>;
    }>(
      'https://api.hubapi.com/crm/v3/objects/contacts/batch/read',
      {
        properties: ['email', 'firstname', 'lastname'],
        inputs: contactIds.map(id => ({ id }))
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return (batchResponse.data?.results || [])
      .filter(c => c.properties.email)
      .map(c => ({
        id: c.id,
        email: c.properties.email!,
        firstName: c.properties.firstname?.trim() || undefined,
        lastName: c.properties.lastname?.trim() || undefined
      }));
  } catch (error) {
    logger.error('Failed to get associated contacts', { projectId, error: String(error) });
    return [];
  }
}

// Remove association between a project and a contact
export async function removeProjectContactAssociation(projectId: string, contactId: string): Promise<void> {
  try {
    await axios.delete(
      `https://api.hubapi.com/crm/v4/objects/${CUSTOM_OBJECT_TYPE}/${projectId}/associations/contacts/${contactId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`
        }
      }
    );
    logger.info('Removed project-contact association', { projectId, contactId });
  } catch (error) {
    logger.error('Failed to remove project-contact association', { projectId, contactId, error: String(error) });
    throw error;
  }
}

// Collect unique cc_email addresses across all projects for a given user email
export async function getCcEmailsForUser(email: string): Promise<string[]> {
  try {
    const projects = await getProjectsByEmail(email);
    const ccEmails = new Set<string>();
    for (const project of projects) {
      const cc = project.properties.cc_email?.trim();
      if (cc) {
        for (const addr of cc.split(/[,;]\s*/)) {
          const normalized = addr.trim().toLowerCase();
          if (normalized && normalized !== email.toLowerCase().trim()) {
            ccEmails.add(normalized);
          }
        }
      }
    }
    return Array.from(ccEmails);
  } catch (error) {
    logger.warn('Failed to get cc_emails for user, skipping CC', { email, error: String(error) });
    return [];
  }
}

// Parse document_data safely
export function parseDocumentData(documentDataStr: string | null | undefined): DocumentData {
  if (!documentDataStr) {
    return {
      _meta: { selectedSections: ['personal'] }
    };
  }
  
  try {
    return JSON.parse(documentDataStr);
  } catch {
    logger.warn('Failed to parse document_data, returning default');
    return {
      _meta: { selectedSections: ['personal'] }
    };
  }
}
