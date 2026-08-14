import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { logger } from '../utils/logger';

/**
 * Railway Storage Bucket — S3-compatible object storage, used as the staging
 * area between "the client's upload succeeded" and "HubSpot has the file".
 *
 * The backend mediates every transfer rather than handing the browser a
 * presigned URL: it means the bytes are validated before they are stored, there
 * is no bucket CORS to configure, and no write capability is ever handed to a
 * client. The cost is that uploads still travel through the app.
 *
 * Durability lives here, not on the container filesystem — which is why no
 * Railway volume is needed, and why the service can still run multiple replicas
 * and deploy without downtime.
 */
const BUCKET = process.env.BUCKET_NAME || process.env.BUCKET;
const ENDPOINT = process.env.BUCKET_URL || process.env.ENDPOINT;
const ACCESS_KEY_ID = process.env.BUCKET_ACCESS_ID || process.env.ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.BUCKET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY;
const REGION = process.env.BUCKET_REGION || process.env.REGION || 'auto';

let client: S3Client | null = null;

export function isBucketConfigured(): boolean {
  return Boolean(BUCKET && ENDPOINT && ACCESS_KEY_ID && SECRET_ACCESS_KEY);
}

function getClient(): S3Client {
  if (!isBucketConfigured()) {
    throw new Error(
      'Bucket is not configured (BUCKET_NAME, BUCKET_URL, BUCKET_ACCESS_ID, BUCKET_ACCESS_KEY)'
    );
  }
  if (!client) {
    client = new S3Client({
      region: REGION,
      endpoint: ENDPOINT,
      // Non-AWS S3 endpoints address buckets by path rather than subdomain.
      forcePathStyle: true,
      credentials: {
        accessKeyId: ACCESS_KEY_ID!,
        secretAccessKey: SECRET_ACCESS_KEY!
      }
    });
  }
  return client;
}

// Object key for a staged upload. Grouped by project so a bucket listing is
// navigable, with a uuid so two files of the same name never collide.
export function buildObjectKey(projectId: string, originalFilename: string): string {
  const ext = path.extname(originalFilename).slice(0, 12);
  return `staging/${projectId}/${randomUUID()}${ext}`;
}

/**
 * Stream a local file into the bucket.
 *
 * Uses lib-storage's Upload, which switches to multipart automatically for
 * large files instead of buffering the whole thing in memory.
 */
export async function putFile(
  key: string,
  filePath: string,
  contentType?: string
): Promise<void> {
  const upload = new Upload({
    client: getClient(),
    params: {
      Bucket: BUCKET!,
      Key: key,
      Body: fs.createReadStream(filePath),
      ...(contentType ? { ContentType: contentType } : {})
    }
  });

  await upload.done();
  logger.info('Staged file to bucket', { key });
}

export async function getObjectStream(key: string): Promise<Readable> {
  const result = await getClient().send(
    new GetObjectCommand({ Bucket: BUCKET!, Key: key })
  );
  return result.Body as Readable;
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: BUCKET!, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// Best effort: failing to clean up a staged object must never fail the
// operation that triggered it.
export async function deleteObject(key: string): Promise<void> {
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: key }));
    logger.info('Removed staged object from bucket', { key });
  } catch (error) {
    logger.error('Failed to remove staged object', { key, error: String(error) });
  }
}
