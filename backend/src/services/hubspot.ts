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
      ['client_project_name', 'email', 'hs_pipeline_stage', 'document_data', 'file_directory']
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
        ['client_project_name', 'email', 'hs_pipeline_stage', 'document_data']
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

// Get all projects (for admin)
export async function getAllProjects(limit: number = 100, after?: string): Promise<{
  projects: Project[];
  paging?: { next?: { after: string } };
}> {
  try {
    const response = await hubspotClient.crm.objects.basicApi.getPage(
      CUSTOM_OBJECT_TYPE,
      limit,
      after,
      ['client_project_name', 'email', 'hs_pipeline_stage', 'document_data']
    );

    return {
      projects: response.results.map(p => ({
        id: p.id,
        properties: p.properties as unknown as ProjectProperties
      })),
      paging: response.paging
    };
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
