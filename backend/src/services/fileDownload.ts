import { Response } from 'express';
import axios from 'axios';
import * as bucket from './bucket';
import * as hubspot from './hubspot';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

interface DownloadableFile {
  id: string;
  originalFilename: string;
  mimeType: string | null;
  storagePath: string | null;
  hubspotFileId: string | null;
}

// RFC 5987 encoding, so names with spaces, commas or non-ASCII characters
// survive the header intact rather than being truncated at the first comma.
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Stream a file to the browser as a download.
 *
 * Prefers the staged copy on the volume — it is local, needs no upstream call,
 * and exists precisely in the window before HubSpot has the file. Falls back to
 * proxying the HubSpot copy once staging has been cleared.
 *
 * Proxying rather than redirecting is deliberate: HubSpot serves files inline,
 * so a redirect would open a PDF in a browser tab instead of downloading it,
 * and the saved name would come from the URL rather than the original filename.
 */
export async function streamFileForDownload(file: DownloadableFile, res: Response): Promise<void> {
  res.setHeader('Content-Disposition', contentDisposition(file.originalFilename));
  if (file.mimeType) res.setHeader('Content-Type', file.mimeType);

  // Serve the staged object while HubSpot is still catching up, so a file is
  // downloadable from the moment it is accepted.
  if (file.storagePath) {
    try {
      const staged = await bucket.getObjectStream(file.storagePath);
      staged.pipe(res);
      staged.on('error', (err: Error) => {
        logger.error('Failed to stream staged object', { fileId: file.id, error: String(err) });
        res.destroy();
      });
      return;
    } catch (error) {
      logger.warn('Staged object unavailable, falling back to HubSpot', {
        fileId: file.id,
        error: String(error)
      });
    }
  }

  if (!file.hubspotFileId) {
    throw new AppError('No copy of this file is currently available.', 404);
  }

  // Resolved per download rather than stored, so a rename in HubSpot can never
  // leave us pointing at a dead URL.
  const url = await hubspot.getFileUrl(file.hubspotFileId);
  if (!url) {
    throw new AppError('This file could not be retrieved from HubSpot. Please try again.', 502);
  }

  const upstream = await axios.get(url, {
    responseType: 'stream',
    // Large files must not be buffered in memory on the way through.
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (upstream.headers['content-length']) {
    res.setHeader('Content-Length', upstream.headers['content-length']);
  }

  upstream.data.pipe(res);

  upstream.data.on('error', (err: Error) => {
    logger.error('Failed to proxy file from HubSpot', { fileId: file.id, error: String(err) });
    res.destroy();
  });
}
