import cron from 'node-cron';
import { logger } from '../utils/logger';
import prisma from '../db/client';
import * as hubspot from './hubspot';
import { sendAdminUploadDigestEmail, UploadDigestProject } from './email';
import { getAdminEmails } from './settings';

const TIMEZONE = 'America/Chicago';

async function gatherUploadDigest(days: number): Promise<UploadDigestProject[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const uploads = await prisma.fileUpload.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' }
  });

  if (uploads.length === 0) return [];

  const byProject = new Map<string, typeof uploads>();
  for (const u of uploads) {
    const list = byProject.get(u.projectId) || [];
    list.push(u);
    byProject.set(u.projectId, list);
  }

  const projects: UploadDigestProject[] = [];

  for (const [projectId, projectUploads] of byProject) {
    let projectName = projectId;
    let clientEmail = '';

    try {
      const project = await hubspot.getProject(projectId);
      projectName = project.properties.client_project_name || projectId;
      clientEmail = project.properties.email || '';
    } catch (err) {
      logger.warn('Could not fetch project for digest', { projectId, error: String(err) });
    }

    const categoryLabelCache = new Map<string, string>();
    const getCategoryLabel = (key: string): string => {
      if (categoryLabelCache.has(key)) return categoryLabelCache.get(key)!;
      const label = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      categoryLabelCache.set(key, label);
      return label;
    };

    projects.push({
      projectId,
      projectName,
      clientEmail,
      uploads: projectUploads.map((u: typeof projectUploads[number]) => ({
        filename: u.originalFilename,
        categoryLabel: getCategoryLabel(u.categoryKey),
        status: u.status,
        uploadedAt: u.createdAt.toLocaleString('en-US', { timeZone: TIMEZONE })
      }))
    });
  }

  return projects;
}

async function getDigestRecipients(frequency: 'daily' | 'weekly'): Promise<string[]> {
  const adminEmails = await getAdminEmails();
  if (adminEmails.length === 0) return [];

  const recipients: string[] = [];
  for (const email of adminEmails) {
    try {
      const prefs = await prisma.notificationPreference.findUnique({
        where: { email: email.toLowerCase().trim() }
      });
      if (!prefs) {
        // No preference record = default 'none', skip
        continue;
      }
      if (prefs.adminUploadDigest === frequency) {
        recipients.push(email);
      }
    } catch {
      // On error, skip rather than spam
    }
  }
  return recipients;
}

export async function runUploadDigest(frequency: 'daily' | 'weekly'): Promise<{ sent: number; skipped: boolean }> {
  const label = frequency === 'daily' ? 'Daily' : 'Weekly';
  const days = frequency === 'daily' ? 1 : 7;

  logger.info(`Running ${label} upload digest...`);

  const recipients = await getDigestRecipients(frequency);
  if (recipients.length === 0) {
    logger.info(`${label} upload digest: no recipients opted in, skipping`);
    return { sent: 0, skipped: true };
  }

  const projects = await gatherUploadDigest(days);
  if (projects.length === 0) {
    logger.info(`${label} upload digest: no uploads in the last ${days} day(s), skipping`);
    return { sent: 0, skipped: true };
  }

  let sent = 0;
  for (const email of recipients) {
    try {
      await sendAdminUploadDigestEmail(email, label as 'Daily' | 'Weekly', projects);
      sent++;
    } catch (err) {
      logger.error(`Failed to send ${label} digest to ${email}`, { error: String(err) });
    }
  }

  logger.info(`${label} upload digest sent`, { recipients: sent, projects: projects.length });
  return { sent, skipped: false };
}

export function startScheduler(): void {
  // Daily digest: every day at 7:00 AM Central
  cron.schedule('0 7 * * *', async () => {
    try {
      await runUploadDigest('daily');
    } catch (err) {
      logger.error('Daily upload digest cron failed', { error: String(err) });
    }
  }, { timezone: TIMEZONE });

  // Weekly digest: every Monday at 7:00 AM Central
  cron.schedule('0 7 * * 1', async () => {
    try {
      await runUploadDigest('weekly');
    } catch (err) {
      logger.error('Weekly upload digest cron failed', { error: String(err) });
    }
  }, { timezone: TIMEZONE });

  logger.info('Upload digest scheduler started (daily 7am CT, weekly Mon 7am CT)');
}
