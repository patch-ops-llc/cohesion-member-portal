import { Router } from 'express';
import * as hubspot from '../services/hubspot';
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

export default router;
