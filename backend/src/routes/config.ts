import { Router } from 'express';
import {
  maxFileSize,
  maxUploadMb,
  maxFilesPerUpload,
  allowedMimeTypes,
  allowedExtensions
} from '../utils/validation';

const router = Router();

/**
 * GET /api/config
 * Public client bootstrap. The upload limits live on the server; the frontend
 * reads them from here so the two can never drift out of sync (the old code
 * hardcoded 5MB in five separate places).
 */
router.get('/', (req, res) => {
  res.json({
    upload: {
      maxFileSize,
      maxUploadMb,
      maxFilesPerUpload,
      allowedMimeTypes,
      allowedExtensions
    }
  });
});

export default router;
