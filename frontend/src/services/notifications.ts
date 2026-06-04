import api from './api';
import type {
  UserNotificationPreferences,
  AdminNotificationPreferences,
  EmailTemplate,
  RegisteredUser,
  WeeklyDigestClient,
  WeeklyClientDigestSchedule,
  UploadDigestSchedule
} from '../types';

// ─── User notification preferences ────────────────────────────────────

export async function getUserPreferences(): Promise<UserNotificationPreferences> {
  const { data } = await api.get('/notifications/preferences');
  return data.preferences;
}

export async function updateUserPreferences(
  updates: Partial<UserNotificationPreferences>
): Promise<UserNotificationPreferences> {
  const { data } = await api.patch('/notifications/preferences', updates);
  return data.preferences;
}

// ─── Admin notification email list ────────────────────────────────────

export async function getAdminEmails(): Promise<string[]> {
  const { data } = await api.get('/notifications/admin/emails');
  return data.emails;
}

export async function setAdminEmails(emails: string[]): Promise<string[]> {
  const { data } = await api.put('/notifications/admin/emails', { emails });
  return data.emails;
}

// ─── Admin notification preferences ───────────────────────────────────

export async function getAdminPreferences(): Promise<{
  adminEmails: string[];
  preferences: AdminNotificationPreferences[];
}> {
  const { data } = await api.get('/notifications/admin/preferences');
  return { adminEmails: data.adminEmails, preferences: data.preferences };
}

export async function updateAdminPreference(
  email: string,
  updates: Partial<Omit<AdminNotificationPreferences, 'email'>>
): Promise<AdminNotificationPreferences> {
  const { data } = await api.patch('/notifications/admin/preferences', { email, ...updates });
  return data.preferences;
}

export async function updateAdminPreferencesBulk(
  updates: Partial<Omit<AdminNotificationPreferences, 'email'>>
): Promise<AdminNotificationPreferences[]> {
  const { data } = await api.patch('/notifications/admin/preferences/bulk', updates);
  return data.preferences;
}

// ─── Upload digest ────────────────────────────────────────────────────

export async function triggerUploadDigest(
  frequency: 'daily' | 'weekly'
): Promise<{ sent: number; skipped: boolean; message: string }> {
  const { data } = await api.post('/admin/upload-digest/send', { frequency });
  return data;
}

// ─── Weekly client digest ─────────────────────────────────────────────

export async function getWeeklyDigestEnabled(): Promise<boolean> {
  const { data } = await api.get('/admin/weekly-digest/settings');
  return data.enabled;
}

export async function setWeeklyDigestEnabled(enabled: boolean): Promise<boolean> {
  const { data } = await api.put('/admin/weekly-digest/settings', { enabled });
  return data.enabled;
}

export async function sendWeeklyClientDigest(
  emails?: string[]
): Promise<{ sent: number; skipped: boolean; message: string }> {
  const { data } = await api.post('/admin/weekly-digest/send', emails && emails.length > 0 ? { emails } : {});
  return data;
}

export async function getWeeklyDigestClients(): Promise<WeeklyDigestClient[]> {
  const { data } = await api.get('/admin/weekly-digest/clients');
  return data.clients;
}

export async function setClientWeeklyDigest(email: string, enabled: boolean): Promise<boolean> {
  const { data } = await api.patch('/admin/weekly-digest/clients', { email, enabled });
  return data.weeklyUpdate;
}

export async function setClientsWeeklyDigestBulk(emails: string[], enabled: boolean): Promise<number> {
  const { data } = await api.patch('/admin/weekly-digest/clients/bulk', { emails, enabled });
  return data.updated;
}

// ─── Digest schedules ─────────────────────────────────────────────────

export async function getWeeklyDigestSchedule(): Promise<{
  schedule: WeeklyClientDigestSchedule;
  timezones: string[];
}> {
  const { data } = await api.get('/admin/weekly-digest/schedule');
  return { schedule: data.schedule, timezones: data.timezones };
}

export async function setWeeklyDigestSchedule(
  schedule: WeeklyClientDigestSchedule
): Promise<WeeklyClientDigestSchedule> {
  const { data } = await api.put('/admin/weekly-digest/schedule', schedule);
  return data.schedule;
}

export async function getUploadDigestSchedule(): Promise<{
  schedule: UploadDigestSchedule;
  timezones: string[];
}> {
  const { data } = await api.get('/admin/upload-digest/schedule');
  return { schedule: data.schedule, timezones: data.timezones };
}

export async function setUploadDigestSchedule(
  schedule: UploadDigestSchedule
): Promise<UploadDigestSchedule> {
  const { data } = await api.put('/admin/upload-digest/schedule', schedule);
  return data.schedule;
}

// ─── Registered users (registration audit) ────────────────────────────

export async function getRegisteredUsers(search?: string): Promise<{
  users: RegisteredUser[];
  total: number;
  registeredLast7Days: number;
}> {
  const { data } = await api.get('/admin/registered-users', {
    params: search ? { search } : undefined
  });
  return { users: data.users, total: data.total, registeredLast7Days: data.registeredLast7Days };
}

// ─── Email templates ──────────────────────────────────────────────────

export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  const { data } = await api.get('/email-templates');
  return data.templates;
}

export async function getEmailTemplate(key: string): Promise<EmailTemplate> {
  const { data } = await api.get(`/email-templates/${key}`);
  return data.template;
}

export async function updateEmailTemplate(
  key: string,
  updates: Partial<Pick<EmailTemplate, 'senderName' | 'senderEmail' | 'subject' | 'body'>>
): Promise<EmailTemplate> {
  const { data } = await api.put(`/email-templates/${key}`, updates);
  return data.template;
}

export async function resetEmailTemplate(key: string): Promise<EmailTemplate> {
  const { data } = await api.post(`/email-templates/reset/${key}`);
  return data.template;
}

export async function sendTestEmail(key: string, recipientEmail: string): Promise<string> {
  const { data } = await api.post(`/email-templates/test/${key}`, { recipientEmail });
  return data.message;
}
