import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// Local file storage (can be extended to S3 later)
const STORAGE_PATH = process.env.FILE_STORAGE_PATH || './uploads';

// Ensure storage directory exists
function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_PATH)) {
    fs.mkdirSync(STORAGE_PATH, { recursive: true });
    logger.info('Created storage directory', { path: STORAGE_PATH });
  }
}

// Save file to local storage
export async function saveFile(
  sourcePath: string,
  originalFilename: string,
  projectId: string
): Promise<string> {
  ensureStorageDir();

  // Create project subdirectory
  const projectDir = path.join(STORAGE_PATH, projectId);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  // Generate unique filename
  const ext = path.extname(originalFilename);
  const uniqueName = `${uuidv4()}${ext}`;
  const destPath = path.join(projectDir, uniqueName);

  // Copy file
  await fs.promises.copyFile(sourcePath, destPath);
  
  // Delete temp file
  await fs.promises.unlink(sourcePath).catch(() => {});

  logger.info('File saved to storage', { destPath, originalFilename });
  return destPath;
}

// Get file path
export function getFilePath(storedFilename: string): string {
  return path.join(STORAGE_PATH, storedFilename);
}

// Delete file
export async function deleteFile(storedPath: string): Promise<void> {
  try {
    if (fs.existsSync(storedPath)) {
      await fs.promises.unlink(storedPath);
      logger.info('File deleted', { path: storedPath });
    }
  } catch (error) {
    logger.error('Failed to delete file', { path: storedPath, error: String(error) });
    throw error;
  }
}

// Get file stats
export async function getFileStats(storedPath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.stat(storedPath);
  } catch {
    return null;
  }
}

// Check if file exists
export function fileExists(storedPath: string): boolean {
  return fs.existsSync(storedPath);
}
