import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../utils/logger';
import prisma from '../db/client';
import * as hubspot from './hubspot';
import {
  sendAdminUploadDigestEmail,
  UploadDigestProject,
  sendWeeklyUpdateEmail,
  sendAdminWeeklyUpdateEmail,
  WeeklyProjectSummary
} from './email';
import {
  getAdminEmails,
  getWeeklyClientDigestEnabled,
  getWeeklyClientDigestSchedule,
  getUploadDigestSchedule
} from './settings';
import { getNormalizedStage } from '../utils/documentData';

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

// ─── Weekly client digest ──────────────────────────────────────────────
interface ClientDigest {
  email: string;
  cc: string[];
  projects: WeeklyProjectSummary[];
}

function summarizeProject(project: hubspot.Project): WeeklyProjectSummary {
  const documentData = hubspot.parseDocumentData(project.properties.document_data);

  let totalDocs = 0;
  let pendingDocs = 0;
  let acceptedDocs = 0;
  let actionNeeded = 0;

  for (const key of Object.keys(documentData)) {
    if (key === '_meta') continue;
    const category = documentData[key] as hubspot.CategoryData;
    if (category.status !== 'active' || !category.documents) continue;
    for (const doc of category.documents) {
      totalDocs++;
      if (doc.status === 'pending_review') pendingDocs++;
      if (doc.status === 'accepted') acceptedDocs++;
      if (doc.status === 'needs_resubmission' || doc.status === 'missing_files' || doc.status === 'not_submitted') {
        actionNeeded++;
      }
    }
  }

  return {
    projectName: project.properties.client_project_name || 'Your Project',
    totalDocs,
    pendingDocs,
    acceptedDocs,
    actionNeeded,
    stage: getNormalizedStage(project.properties.hs_pipeline_stage)
  };
}

// Group all projects by client email and build per-client digest payloads.
async function gatherClientDigests(): Promise<ClientDigest[]> {
  const { projects } = await hubspot.getAllProjects();

  const byEmail = new Map<string, { projects: hubspot.Project[]; cc: Set<string> }>();

  for (const project of projects) {
    const email = project.properties.email?.toLowerCase().trim();
    if (!email) continue;

    const entry = byEmail.get(email) || { projects: [], cc: new Set<string>() };
    entry.projects.push(project);

    const cc = project.properties.cc_email?.trim();
    if (cc) {
      for (const addr of cc.split(/[,;]\s*/)) {
        const normalized = addr.trim().toLowerCase();
        if (normalized && normalized !== email) entry.cc.add(normalized);
      }
    }

    byEmail.set(email, entry);
  }

  const digests: ClientDigest[] = [];
  for (const [email, entry] of byEmail) {
    digests.push({
      email,
      cc: Array.from(entry.cc),
      projects: entry.projects.map(summarizeProject)
    });
  }

  return digests;
}

interface WeeklyDigestRunOptions {
  // Restrict the send to this set of client emails (case-insensitive).
  filterEmails?: string[];
  // Skip the global on/off check (used for manual admin-triggered sends).
  skipGlobalCheck?: boolean;
}

export async function runWeeklyClientDigest(opts: WeeklyDigestRunOptions = {}): Promise<{ sent: number; skipped: boolean }> {
  logger.info('Running weekly client digest...', { filtered: Boolean(opts.filterEmails?.length), manual: Boolean(opts.skipGlobalCheck) });

  if (!opts.skipGlobalCheck) {
    const enabled = await getWeeklyClientDigestEnabled();
    if (!enabled) {
      logger.info('Weekly client digest is disabled, skipping');
      return { sent: 0, skipped: true };
    }
  }

  let digests = await gatherClientDigests();

  if (opts.filterEmails && opts.filterEmails.length > 0) {
    const allowed = new Set(opts.filterEmails.map(e => e.toLowerCase().trim()));
    digests = digests.filter(d => allowed.has(d.email));
  }

  if (digests.length === 0) {
    logger.info('Weekly client digest: no matching client projects found, skipping');
    return { sent: 0, skipped: true };
  }

  let sent = 0;
  for (const digest of digests) {
    try {
      // Best-effort display name lookup; falls back to "there" inside the email.
      let displayName = '';
      try {
        const contact = await hubspot.findContactByEmail(digest.email);
        displayName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ');
      } catch {
        // ignore name lookup failures
      }

      // sendWeeklyUpdateEmail respects the per-user weeklyUpdate preference.
      await sendWeeklyUpdateEmail(digest.email, displayName, digest.projects, digest.cc);
      sent++;
    } catch (err) {
      logger.error('Failed to send weekly client digest', { email: digest.email, error: String(err) });
    }
  }

  logger.info('Weekly client digest sent', { recipients: sent, totalClients: digests.length });
  return { sent, skipped: false };
}

// ─── Weekly admin summary ───────────────────────────────────────────────
export async function runAdminWeeklySummary(): Promise<{ skipped: boolean }> {
  logger.info('Running weekly admin summary...');

  const { projects } = await hubspot.getAllProjects();

  let totalProjects = projects.length;
  let activeProjects = 0;
  let totalPending = 0;
  let totalAccepted = 0;

  for (const project of projects) {
    const documentData = hubspot.parseDocumentData(project.properties.document_data);
    let hasActive = false;
    for (const key of Object.keys(documentData)) {
      if (key === '_meta') continue;
      const category = documentData[key] as hubspot.CategoryData;
      if (category.status === 'active') hasActive = true;
      if (category.documents) {
        for (const doc of category.documents) {
          if (doc.status === 'pending_review') totalPending++;
          if (doc.status === 'accepted') totalAccepted++;
        }
      }
    }
    if (hasActive) activeProjects++;
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [newRegistrations, newUploads] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.fileUpload.count({ where: { createdAt: { gte: weekAgo } } })
  ]);

  await sendAdminWeeklyUpdateEmail({
    totalProjects,
    activeProjects,
    totalPending,
    totalAccepted,
    newRegistrations,
    newUploads
  });

  logger.info('Weekly admin summary sent', { totalProjects, newRegistrations, newUploads });
  return { skipped: false };
}

// ─── Cron task management ──────────────────────────────────────────────
// We hold references so schedules can be updated live (no redeploy) when an
// admin changes them in the UI.
let uploadDailyTask: ScheduledTask | null = null;
let uploadWeeklyTask: ScheduledTask | null = null;
let clientDigestTask: ScheduledTask | null = null;
let adminSummaryTask: ScheduledTask | null = null;

// Add `minutes` to an hour:minute pair, rolling over the hour (wraps past midnight).
function addMinutes(hour: number, minute: number, minutes: number): { hour: number; minute: number } {
  const total = (hour * 60 + minute + minutes) % (24 * 60);
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export async function scheduleUploadDigest(): Promise<void> {
  const s = await getUploadDigestSchedule();

  uploadDailyTask?.stop();
  uploadWeeklyTask?.stop();

  // Daily digest: every day at the configured time
  uploadDailyTask = cron.schedule(`${s.minute} ${s.hour} * * *`, async () => {
    try {
      await runUploadDigest('daily');
    } catch (err) {
      logger.error('Daily upload digest cron failed', { error: String(err) });
    }
  }, { timezone: s.timezone });

  // Weekly digest: on the configured day at the configured time
  uploadWeeklyTask = cron.schedule(`${s.minute} ${s.hour} * * ${s.weeklyDayOfWeek}`, async () => {
    try {
      await runUploadDigest('weekly');
    } catch (err) {
      logger.error('Weekly upload digest cron failed', { error: String(err) });
    }
  }, { timezone: s.timezone });

  logger.info('Upload digest scheduled', {
    daily: `${s.hour}:${String(s.minute).padStart(2, '0')}`,
    weeklyDayOfWeek: s.weeklyDayOfWeek,
    timezone: s.timezone
  });
}

export async function scheduleClientDigest(): Promise<void> {
  const s = await getWeeklyClientDigestSchedule();

  clientDigestTask?.stop();
  adminSummaryTask?.stop();

  // Client weekly digest: on the configured day at the configured time
  clientDigestTask = cron.schedule(`${s.minute} ${s.hour} * * ${s.dayOfWeek}`, async () => {
    try {
      await runWeeklyClientDigest();
    } catch (err) {
      logger.error('Weekly client digest cron failed', { error: String(err) });
    }
  }, { timezone: s.timezone });

  // Admin weekly summary runs 5 minutes after the client digest, same day.
  const summaryTime = addMinutes(s.hour, s.minute, 5);
  adminSummaryTask = cron.schedule(`${summaryTime.minute} ${summaryTime.hour} * * ${s.dayOfWeek}`, async () => {
    try {
      await runAdminWeeklySummary();
    } catch (err) {
      logger.error('Weekly admin summary cron failed', { error: String(err) });
    }
  }, { timezone: s.timezone });

  logger.info('Client weekly digest scheduled', {
    dayOfWeek: s.dayOfWeek,
    time: `${s.hour}:${String(s.minute).padStart(2, '0')}`,
    timezone: s.timezone
  });
}

export async function startScheduler(): Promise<void> {
  await scheduleUploadDigest();
  await scheduleClientDigest();
  logger.info('Scheduler started with configured schedules');
}
