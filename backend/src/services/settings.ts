import prisma from '../db/client';
import { logger } from '../utils/logger';

const ADMIN_EMAILS_KEY = 'adminNotificationEmails';

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
