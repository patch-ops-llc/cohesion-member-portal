import { Router } from 'express';
import * as hubspot from '../services/hubspot';
import { mergeDocumentData } from '../utils/documentData';
import type { ModifiedFields } from '../utils/documentData';
import type { DocumentData } from '../services/hubspot';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/cards/projects/:id
 * Returns document_data for the HubSpot CRM card (Document Checklist).
 * Called by the HubSpot UI Extension when viewing a p_client_projects record.
 *
 * For production, consider validating the HubSpot request signature
 * (X-HubSpot-Signature-v3) using CLIENT_SECRET.
 */
router.get('/projects/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await hubspot.getProject(id);
    const documentData = hubspot.parseDocumentData(project.properties.document_data);

    logger.info('Card fetch', { projectId: id });

    res.json({ documentData });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/cards/projects/:id
 * Saves document_data from the HubSpot CRM card.
 * Merges local changes with latest HubSpot data to handle concurrent edits.
 *
 * Body: { documentData: DocumentData, modifiedFields: ModifiedFields }
 */
router.patch('/projects/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { documentData: localData, modifiedFields } = req.body as {
      documentData: DocumentData;
      modifiedFields: ModifiedFields;
    };

    if (!localData || !modifiedFields) {
      return res.status(400).json({ error: 'documentData and modifiedFields required' });
    }

    const project = await hubspot.getProject(id);
    const hubspotData = hubspot.parseDocumentData(project.properties.document_data);

    const merged = mergeDocumentData(hubspotData, localData, modifiedFields);
    await hubspot.updateDocumentData(id, merged);

    logger.info('Card save', { projectId: id });

    res.json({ success: true, documentData: merged });
  } catch (error) {
    next(error);
  }
});

export default router;
