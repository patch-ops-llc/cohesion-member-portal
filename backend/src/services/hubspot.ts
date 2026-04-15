import { Client } from '@hubspot/api-client';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { logger } from '../utils/logger';

const hubspotClient = new Client({ 
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN 
});

const CUSTOM_OBJECT_TYPE = process.env.HUBSPOT_CUSTOM_OBJECT_TYPE || '2-171216725';

export interface ProjectProperties {
  client_project_name: string;
  email: string;
  hs_pipeline_stage: string;
  document_data: string;
  file_directory?: string;
  cc_email?: string;
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
      ['client_project_name', 'email', 'hs_pipeline_stage', 'document_data', 'file_directory', 'cc_email']
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

  try {
    do {
      const response = await hubspotClient.crm.objects.basicApi.getPage(
        CUSTOM_OBJECT_TYPE,
        100,
        after,
        ['client_project_name', 'email', 'hs_pipeline_stage', 'document_data', 'cc_email']
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

  try {
    do {
      const response = await hubspotClient.crm.objects.basicApi.getPage(
        CUSTOM_OBJECT_TYPE,
        100,
        after,
        ['client_project_name', 'email', 'hs_pipeline_stage', 'document_data', 'cc_email']
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

// Update document_data field
export async function updateDocumentData(projectId: string, documentData: DocumentData): Promise<void> {
  try {
    await hubspotClient.crm.objects.basicApi.update(
      CUSTOM_OBJECT_TYPE,
      projectId,
      {
        properties: {
          document_data: JSON.stringify(documentData)
        }
      }
    );
    logger.info('Updated document_data in HubSpot', { projectId });
  } catch (error) {
    logger.error('Failed to update document_data', { projectId, error: String(error) });
    throw error;
  }
}

// Upload file to HubSpot File Manager
export async function uploadFileToHubSpot(
  filePath: string,
  fileName: string,
  folderId?: string
): Promise<string> {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
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
        }
      }
    );

    logger.info('Uploaded file to HubSpot', { fileId: response.data.id, fileName });
    return response.data.id;
  } catch (error) {
    logger.error('Failed to upload file to HubSpot', { fileName, error: String(error) });
    throw error;
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
    
    // Check if folder already exists
    if (project.properties.file_directory) {
      const match = project.properties.file_directory.match(/folderId=(\d+)/);
      if (match) {
        logger.debug('Using existing folder', { folderId: match[1] });
        return match[1];
      }
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
    const folderUrl = `https://app.hubspot.com/files/${folderId}`;

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
}): Promise<Project> {
  try {
    const defaultDocumentData: DocumentData = {
      _meta: { selectedSections: ['personal'] }
    };

    const response = await hubspotClient.crm.objects.basicApi.create(
      CUSTOM_OBJECT_TYPE,
      {
        properties: {
          client_project_name: properties.client_project_name,
          email: properties.email.toLowerCase().trim(),
          document_data: JSON.stringify(defaultDocumentData)
        },
        associations: []
      }
    );

    logger.info('Created project in HubSpot', { projectId: response.id, name: properties.client_project_name });

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

const PROJECT_PROPERTIES = ['client_project_name', 'email', 'hs_pipeline_stage', 'document_data', 'cc_email'];

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
        properties: PROJECT_PROPERTIES,
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

// Combine email-matched and association-matched projects (deduplicated)
export async function getProjectsForUser(email: string, contactId: string | null): Promise<Project[]> {
  const [emailProjects, assocProjects] = await Promise.all([
    getProjectsByEmail(email),
    contactId ? getProjectsByContactAssociation(contactId) : Promise.resolve([])
  ]);

  const projectMap = new Map<string, Project>();
  for (const p of emailProjects) projectMap.set(p.id, p);
  for (const p of assocProjects) {
    if (!projectMap.has(p.id)) projectMap.set(p.id, p);
  }

  logger.info('Combined project lookup', {
    email,
    contactId,
    emailCount: emailProjects.length,
    assocCount: assocProjects.length,
    totalUnique: projectMap.size
  });

  return Array.from(projectMap.values());
}

// Check if a user has access to a specific project (by email match or association)
export async function userHasProjectAccess(
  projectId: string,
  email: string,
  contactId: string | null
): Promise<boolean> {
  const project = await getProject(projectId);

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
