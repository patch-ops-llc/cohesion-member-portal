import api from './api';
import type { UserNotificationPreferences, AdminNotificationPreferences, EmailTemplate } from '../types';

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
