import api from './api';
import type { UserNotificationPreferences, AdminNotificationPreferences } from '../types';

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
