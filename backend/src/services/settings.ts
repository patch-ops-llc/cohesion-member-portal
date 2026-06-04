import prisma from '../db/client';
import { logger } from '../utils/logger';

const ADMIN_EMAILS_KEY = 'adminNotificationEmails';
const WEEKLY_CLIENT_DIGEST_KEY = 'weeklyClientDigestEnabled';
const WEEKLY_CLIENT_DIGEST_SCHEDULE_KEY = 'weeklyClientDigestSchedule';
const UPLOAD_DIGEST_SCHEDULE_KEY = 'adminUploadDigestSchedule';

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
