import prisma from '../db/client';
import { logger } from '../utils/logger';
import { isValidTaxYear, parseTaxYear } from '../utils/taxYear';

const ADMIN_EMAILS_KEY = 'adminNotificationEmails';
const WEEKLY_CLIENT_DIGEST_KEY = 'weeklyClientDigestEnabled';
const WEEKLY_CLIENT_DIGEST_SCHEDULE_KEY = 'weeklyClientDigestSchedule';
const UPLOAD_DIGEST_SCHEDULE_KEY = 'adminUploadDigestSchedule';
const PORTAL_BANNER_KEY = 'portalBanner';
const TAX_SEASON_KEY = 'taxSeason';
const ROLLOVER_RUN_KEY = 'taxSeasonRolloverRun';

// Timezones we allow admins to choose from (must be valid IANA names for node-cron).
export const ALLOWED_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu'
];

const DEFAULT_TIMEZONE = 'America/Chicago';

// Client weekly digest schedule: a single weekly send (day + time).
export interface WeeklyClientDigestSchedule {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  hour: number;      // 0–23
  minute: number;    // 0–59
  timezone: string;
}

// Admin upload digest schedule: one time-of-day used for the daily send and the
// weekly send, plus the day-of-week for the weekly send.
export interface UploadDigestSchedule {
  hour: number;
  minute: number;
  weeklyDayOfWeek: number;
  timezone: string;
}

const DEFAULT_WEEKLY_CLIENT_DIGEST_SCHEDULE: WeeklyClientDigestSchedule = {
  dayOfWeek: 1, // Monday
  hour: 8,
  minute: 0,
  timezone: DEFAULT_TIMEZONE
};

const DEFAULT_UPLOAD_DIGEST_SCHEDULE: UploadDigestSchedule = {
  hour: 7,
  minute: 0,
  weeklyDayOfWeek: 1, // Monday
  timezone: DEFAULT_TIMEZONE
};

function sanitizeTimezone(tz: unknown): string {
  return typeof tz === 'string' && ALLOWED_TIMEZONES.includes(tz) ? tz : DEFAULT_TIMEZONE;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

// ─── Portal banner ─────────────────────────────────────────────────────
// Admin-managed announcement shown across the client-facing portal. Stored as
// one JSON blob in app_settings so content changes need no deployment.

export type BannerStyle = 'info' | 'warning' | 'success';

export interface PortalBanner {
  enabled: boolean;
  message: string;
  style: BannerStyle;
  cta: { label: string; url: string } | null;
  // 'all', or an explicit list of client-facing route patterns
  pages: 'all' | string[];
  updatedAt: string | null;
}

export const BANNER_PAGE_OPTIONS = [
  { value: '/', label: 'Project list' },
  { value: '/project', label: 'Project detail' },
  { value: '/settings/notifications', label: 'Notification settings' },
  { value: '/login', label: 'Login' }
];

const DEFAULT_BANNER: PortalBanner = {
  enabled: false,
  message: '',
  style: 'info',
  cta: null,
  pages: 'all',
  updatedAt: null
};

const BANNER_STYLES: BannerStyle[] = ['info', 'warning', 'success'];

// The CTA is admin-authored and rendered into an href, so restrict it to
// http(s) and relative paths — never javascript:/data: URLs.
function sanitizeCtaUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function sanitizeBanner(input: unknown): PortalBanner {
  const raw = (input ?? {}) as Partial<PortalBanner> & { cta?: { label?: string; url?: string } | null };

  const ctaUrl = sanitizeCtaUrl(raw.cta?.url);
  const ctaLabel = typeof raw.cta?.label === 'string' ? raw.cta.label.trim().slice(0, 60) : '';

  return {
    enabled: Boolean(raw.enabled),
    message: typeof raw.message === 'string' ? raw.message.trim().slice(0, 500) : '',
    style: BANNER_STYLES.includes(raw.style as BannerStyle) ? (raw.style as BannerStyle) : 'info',
    cta: ctaUrl && ctaLabel ? { label: ctaLabel, url: ctaUrl } : null,
    pages: Array.isArray(raw.pages)
      ? raw.pages.filter((p): p is string => typeof p === 'string').slice(0, 20)
      : 'all',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null
  };
}

export async function getPortalBanner(): Promise<PortalBanner> {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: PORTAL_BANNER_KEY } });
    if (setting) return sanitizeBanner(JSON.parse(setting.value));
  } catch (err) {
    logger.warn('Failed to read portal banner, using default', { error: String(err) });
  }
  return { ...DEFAULT_BANNER };
}

export async function setPortalBanner(input: Partial<PortalBanner>): Promise<PortalBanner> {
  const current = await getPortalBanner();
  const next = sanitizeBanner({
    ...current,
    ...input,
    updatedAt: new Date().toISOString()
  });

  await prisma.appSetting.upsert({
    where: { key: PORTAL_BANNER_KEY },
    create: { key: PORTAL_BANNER_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) }
  });

  return next;
}

export async function getAdminEmails(): Promise<string[]> {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: ADMIN_EMAILS_KEY } });
    if (setting) {
      const emails: string[] = JSON.parse(setting.value);
      return emails.map(e => e.toLowerCase().trim()).filter(Boolean);
    }
  } catch (err) {
    logger.warn('Failed to read admin emails from DB, falling back to env var', { error: String(err) });
  }

  // Fallback to env var
  return (process.env.ADMIN_NOTIFICATION_EMAILS || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);
}

export async function setAdminEmails(emails: string[]): Promise<string[]> {
  const normalized = emails.map(e => e.toLowerCase().trim()).filter(Boolean);
  const unique = [...new Set(normalized)];

  await prisma.appSetting.upsert({
    where: { key: ADMIN_EMAILS_KEY },
    create: { key: ADMIN_EMAILS_KEY, value: JSON.stringify(unique) },
    update: { value: JSON.stringify(unique) }
  });

  return unique;
}

// Weekly client digest on/off. Defaults to ENABLED when no setting row exists,
// so the digest "just runs" once deployed; admins can disable it in the UI.
export async function getWeeklyClientDigestEnabled(): Promise<boolean> {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: WEEKLY_CLIENT_DIGEST_KEY } });
    if (setting) {
      return setting.value === 'true';
    }
  } catch (err) {
    logger.warn('Failed to read weekly client digest setting, defaulting to enabled', { error: String(err) });
  }
  return true;
}

export async function setWeeklyClientDigestEnabled(enabled: boolean): Promise<boolean> {
  await prisma.appSetting.upsert({
    where: { key: WEEKLY_CLIENT_DIGEST_KEY },
    create: { key: WEEKLY_CLIENT_DIGEST_KEY, value: enabled ? 'true' : 'false' },
    update: { value: enabled ? 'true' : 'false' }
  });
  return enabled;
}

// ─── Client weekly digest schedule ─────────────────────────────────────
export async function getWeeklyClientDigestSchedule(): Promise<WeeklyClientDigestSchedule> {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: WEEKLY_CLIENT_DIGEST_SCHEDULE_KEY } });
    if (setting) {
      const parsed = JSON.parse(setting.value);
      return {
        dayOfWeek: clampInt(parsed.dayOfWeek, 0, 6, DEFAULT_WEEKLY_CLIENT_DIGEST_SCHEDULE.dayOfWeek),
        hour: clampInt(parsed.hour, 0, 23, DEFAULT_WEEKLY_CLIENT_DIGEST_SCHEDULE.hour),
        minute: clampInt(parsed.minute, 0, 59, DEFAULT_WEEKLY_CLIENT_DIGEST_SCHEDULE.minute),
        timezone: sanitizeTimezone(parsed.timezone)
      };
    }
  } catch (err) {
    logger.warn('Failed to read weekly client digest schedule, using default', { error: String(err) });
  }
  return { ...DEFAULT_WEEKLY_CLIENT_DIGEST_SCHEDULE };
}

export async function setWeeklyClientDigestSchedule(input: Partial<WeeklyClientDigestSchedule>): Promise<WeeklyClientDigestSchedule> {
  const current = await getWeeklyClientDigestSchedule();
  const next: WeeklyClientDigestSchedule = {
    dayOfWeek: clampInt(input.dayOfWeek ?? current.dayOfWeek, 0, 6, current.dayOfWeek),
    hour: clampInt(input.hour ?? current.hour, 0, 23, current.hour),
    minute: clampInt(input.minute ?? current.minute, 0, 59, current.minute),
    timezone: sanitizeTimezone(input.timezone ?? current.timezone)
  };
  await prisma.appSetting.upsert({
    where: { key: WEEKLY_CLIENT_DIGEST_SCHEDULE_KEY },
    create: { key: WEEKLY_CLIENT_DIGEST_SCHEDULE_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) }
  });
  return next;
}

// ─── Admin upload digest schedule ──────────────────────────────────────
export async function getUploadDigestSchedule(): Promise<UploadDigestSchedule> {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: UPLOAD_DIGEST_SCHEDULE_KEY } });
    if (setting) {
      const parsed = JSON.parse(setting.value);
      return {
        hour: clampInt(parsed.hour, 0, 23, DEFAULT_UPLOAD_DIGEST_SCHEDULE.hour),
        minute: clampInt(parsed.minute, 0, 59, DEFAULT_UPLOAD_DIGEST_SCHEDULE.minute),
        weeklyDayOfWeek: clampInt(parsed.weeklyDayOfWeek, 0, 6, DEFAULT_UPLOAD_DIGEST_SCHEDULE.weeklyDayOfWeek),
        timezone: sanitizeTimezone(parsed.timezone)
      };
    }
  } catch (err) {
    logger.warn('Failed to read upload digest schedule, using default', { error: String(err) });
  }
  return { ...DEFAULT_UPLOAD_DIGEST_SCHEDULE };
}

export async function setUploadDigestSchedule(input: Partial<UploadDigestSchedule>): Promise<UploadDigestSchedule> {
  const current = await getUploadDigestSchedule();
  const next: UploadDigestSchedule = {
    hour: clampInt(input.hour ?? current.hour, 0, 23, current.hour),
    minute: clampInt(input.minute ?? current.minute, 0, 59, current.minute),
    weeklyDayOfWeek: clampInt(input.weeklyDayOfWeek ?? current.weeklyDayOfWeek, 0, 6, current.weeklyDayOfWeek),
    timezone: sanitizeTimezone(input.timezone ?? current.timezone)
  };
  await prisma.appSetting.upsert({
    where: { key: UPLOAD_DIGEST_SCHEDULE_KEY },
    create: { key: UPLOAD_DIGEST_SCHEDULE_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) }
  });
  return next;
}

// ─── Tax season ────────────────────────────────────────────────────────
// Which season the portal considers current. Deliberately starts unset: with
// no year configured the portal filter stays off, so deploying this cannot
// silently hide a client's live project. An admin (or the rollover) sets it.

export interface TaxSeasonSettings {
  currentTaxYear: number | null;
  hidePriorYearProjects: boolean;
}

const DEFAULT_TAX_SEASON: TaxSeasonSettings = {
  currentTaxYear: null,
  hidePriorYearProjects: true
};

export async function getTaxSeasonSettings(): Promise<TaxSeasonSettings> {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: TAX_SEASON_KEY } });
    if (setting) {
      const parsed = JSON.parse(setting.value);
      return {
        currentTaxYear: parseTaxYear(parsed.currentTaxYear),
        hidePriorYearProjects: parsed.hidePriorYearProjects !== false
      };
    }
  } catch (err) {
    logger.warn('Failed to read tax season settings, using default', { error: String(err) });
  }
  return { ...DEFAULT_TAX_SEASON };
}

export async function setTaxSeasonSettings(input: Partial<TaxSeasonSettings>): Promise<TaxSeasonSettings> {
  const current = await getTaxSeasonSettings();
  const requestedYear = input.currentTaxYear;

  const next: TaxSeasonSettings = {
    // Explicit null clears the season (turning the filter off); undefined keeps it.
    currentTaxYear:
      requestedYear === undefined
        ? current.currentTaxYear
        : requestedYear === null
          ? null
          : isValidTaxYear(requestedYear)
            ? requestedYear
            : current.currentTaxYear,
    hidePriorYearProjects: input.hidePriorYearProjects ?? current.hidePriorYearProjects
  };

  await prisma.appSetting.upsert({
    where: { key: TAX_SEASON_KEY },
    create: { key: TAX_SEASON_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) }
  });

  return next;
}

// ─── Rollover run state ────────────────────────────────────────────────
// A rollover writes one HubSpot record per client, so it outlives an HTTP
// request. State lives here so the admin UI can poll progress and so a second
// caller can be refused while one is already in flight.

export type RolloverStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface RolloverRunItem {
  email: string;
  sourceProjectId: string;
  sourceName: string;
  newProjectId?: string;
  newName: string;
  outcome: 'created' | 'failed';
  error?: string;
}

export interface RolloverRun {
  status: RolloverStatus;
  targetYear: number | null;
  total: number;
  created: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
  startedBy: string | null;
  error: string | null;
  items: RolloverRunItem[];
}

const IDLE_RUN: RolloverRun = {
  status: 'idle',
  targetYear: null,
  total: 0,
  created: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null,
  startedBy: null,
  error: null,
  items: []
};

/**
 * How long a `running` row may go untouched before we treat it as dead.
 *
 * This is a silence timeout, not a duration cap: the rollover rewrites this row
 * after every client, so `updatedAt` is a heartbeat. Timing out on total
 * elapsed time instead would declare a long-but-healthy run dead and let a
 * second one start alongside it, duplicating records.
 */
const RUN_HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

const STALE_RUN_ERROR =
  'Run was interrupted (the server restarted). Re-running picks up the clients it never reached.';

function parseRun(value: string): RolloverRun {
  return { ...IDLE_RUN, ...JSON.parse(value) } as RolloverRun;
}

function heartbeatExpired(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() > RUN_HEARTBEAT_TIMEOUT_MS;
}

export async function getRolloverRun(): Promise<RolloverRun> {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: ROLLOVER_RUN_KEY } });
    if (!setting) return { ...IDLE_RUN };

    const run = parseRun(setting.value);

    if (run.status === 'running' && heartbeatExpired(setting.updatedAt)) {
      return { ...run, status: 'failed', error: STALE_RUN_ERROR };
    }

    return run;
  } catch (err) {
    logger.warn('Failed to read rollover run state', { error: String(err) });
    return { ...IDLE_RUN };
  }
}

/**
 * Atomically take ownership of the rollover slot.
 *
 * A read-then-write guard isn't enough: planning a rollover takes seconds, so
 * two admins can both see "not running" and then both create a project for
 * every client. The compare-and-swap on `updatedAt` means exactly one caller
 * wins, and the loser is told a run is already in flight.
 */
export async function claimRolloverRun(
  targetYear: number,
  total: number,
  startedBy: string
): Promise<RolloverRun | null> {
  const claim: RolloverRun = {
    ...IDLE_RUN,
    status: 'running',
    targetYear,
    total,
    startedAt: new Date().toISOString(),
    startedBy
  };
  const value = JSON.stringify(claim);

  const existing = await prisma.appSetting.findUnique({ where: { key: ROLLOVER_RUN_KEY } });

  if (!existing) {
    try {
      await prisma.appSetting.create({ data: { key: ROLLOVER_RUN_KEY, value } });
      return claim;
    } catch {
      // Another caller created the row first.
      return null;
    }
  }

  const current = parseRun(existing.value);
  if (current.status === 'running' && !heartbeatExpired(existing.updatedAt)) {
    return null;
  }

  const result = await prisma.appSetting.updateMany({
    where: { key: ROLLOVER_RUN_KEY, updatedAt: existing.updatedAt },
    data: { value }
  });

  return result.count === 1 ? claim : null;
}

export async function saveRolloverRun(run: RolloverRun): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: ROLLOVER_RUN_KEY },
    create: { key: ROLLOVER_RUN_KEY, value: JSON.stringify(run) },
    update: { value: JSON.stringify(run) }
  });
}
