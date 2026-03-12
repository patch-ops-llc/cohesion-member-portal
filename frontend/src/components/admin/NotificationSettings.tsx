import { useState, useEffect } from 'react';
import { Bell, Check, AlertCircle, Mail, Plus, X, Save, Send, Calendar } from 'lucide-react';
import {
  getAdminEmails,
  setAdminEmails,
  getAdminPreferences,
  updateAdminPreference,
  updateAdminPreferencesBulk,
  triggerUploadDigest
} from '../../services/notifications';
import type { AdminNotificationPreferences, UploadDigestFrequency } from '../../types';

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

function Toggle({ enabled, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
        enabled ? 'bg-primary' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

const adminNotificationTypes = [
  {
    key: 'adminRegistration' as const,
    label: 'New Registrations',
    description: 'Get notified when a new client registers on the portal'
  },
  {
    key: 'adminDocumentSubmission' as const,
    label: 'Document Submissions',
    description: 'Get notified when clients submit new documents'
  },
  {
    key: 'adminWeeklyUpdate' as const,
    label: 'Weekly Summary',
    description: 'Receive a weekly overview of all portal activity and project statuses'
  }
];

export function AdminNotificationSettings() {
  const [adminEmails, setAdminEmailsState] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<AdminNotificationPreferences[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Email list management
  const [newEmail, setNewEmail] = useState('');
  const [emailsSaving, setEmailsSaving] = useState(false);
  const [emailsDirty, setEmailsDirty] = useState(false);
  const [digestSending, setDigestSending] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const [emails, prefsResult] = await Promise.all([
        getAdminEmails(),
        getAdminPreferences().catch(() => ({ adminEmails: [], preferences: [] }))
      ]);
      setAdminEmailsState(emails);
      setPreferences(prefsResult.preferences);
      setEmailsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmail = () => {
    const trimmed = newEmail.toLowerCase().trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }
    if (adminEmails.includes(trimmed)) {
      setError('This email is already in the list');
      return;
    }
    setAdminEmailsState(prev => [...prev, trimmed]);
    setNewEmail('');
    setEmailsDirty(true);
    setError(null);
  };

  const handleRemoveEmail = (email: string) => {
    setAdminEmailsState(prev => prev.filter(e => e !== email));
    setEmailsDirty(true);
  };

  const handleSaveEmails = async () => {
    setEmailsSaving(true);
    setError(null);
    try {
      const saved = await setAdminEmails(adminEmails);
      setAdminEmailsState(saved);
      setEmailsDirty(false);
      setSuccessMessage('Admin email list saved');
      setTimeout(() => setSuccessMessage(null), 3000);
      // Reload preferences for the updated list
      const prefsResult = await getAdminPreferences().catch(() => ({ adminEmails: [], preferences: [] }));
      setPreferences(prefsResult.preferences);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save admin emails');
    } finally {
      setEmailsSaving(false);
    }
  };

  const handleToggle = async (
    email: string,
    key: keyof Omit<AdminNotificationPreferences, 'email'>,
    currentValue: boolean
  ) => {
    const newValue = !currentValue;
    const savingKey = `${email}:${key}`;
    setSaving(savingKey);
    setError(null);

    setPreferences(prev =>
      prev.map(p =>
        p.email === email ? { ...p, [key]: newValue } : p
      )
    );

    try {
      await updateAdminPreference(email, { [key]: newValue });
      setSuccessMessage('Preference updated');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setPreferences(prev =>
        prev.map(p =>
          p.email === email ? { ...p, [key]: currentValue } : p
        )
      );
      setError(err instanceof Error ? err.message : 'Failed to update preference');
    } finally {
      setSaving(null);
    }
  };

  const handleBulkToggle = async (
    key: keyof Omit<AdminNotificationPreferences, 'email'>,
    value: boolean
  ) => {
    const savingKey = `bulk:${key}`;
    setSaving(savingKey);
    setError(null);

    const prevPrefs = [...preferences];
    setPreferences(prev => prev.map(p => ({ ...p, [key]: value })));

    try {
      const updated = await updateAdminPreferencesBulk({ [key]: value });
      setPreferences(updated);
      setSuccessMessage(`All admin ${key === 'adminRegistration' ? 'registration' : key === 'adminDocumentSubmission' ? 'document' : 'weekly'} notifications ${value ? 'enabled' : 'disabled'}`);
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setPreferences(prevPrefs);
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
    } finally {
      setSaving(null);
    }
  };

  const handleDigestChange = async (email: string, value: UploadDigestFrequency) => {
    const savingKey = `${email}:adminUploadDigest`;
    setSaving(savingKey);
    setError(null);

    const prevValue = preferences.find(p => p.email === email)?.adminUploadDigest;
    setPreferences(prev =>
      prev.map(p => p.email === email ? { ...p, adminUploadDigest: value } : p)
    );

    try {
      await updateAdminPreference(email, { adminUploadDigest: value });
      setSuccessMessage(`Upload digest set to "${value}" for ${email}`);
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setPreferences(prev =>
        prev.map(p => p.email === email ? { ...p, adminUploadDigest: prevValue || 'none' } : p)
      );
      setError(err instanceof Error ? err.message : 'Failed to update digest preference');
    } finally {
      setSaving(null);
    }
  };

  const handleBulkDigestChange = async (value: UploadDigestFrequency) => {
    setSaving('bulk:adminUploadDigest');
    setError(null);

    const prevPrefs = [...preferences];
    setPreferences(prev => prev.map(p => ({ ...p, adminUploadDigest: value })));

    try {
      const updated = await updateAdminPreferencesBulk({ adminUploadDigest: value });
      setPreferences(updated);
      setSuccessMessage(`All admin upload digests set to "${value}"`);
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setPreferences(prevPrefs);
      setError(err instanceof Error ? err.message : 'Failed to update digest preferences');
    } finally {
      setSaving(null);
    }
  };

  const handleSendDigest = async (frequency: 'daily' | 'weekly') => {
    setDigestSending(frequency);
    setError(null);
    try {
      const result = await triggerUploadDigest(frequency);
      setSuccessMessage(result.message);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send digest');
    } finally {
      setDigestSending(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 bg-gray-200 rounded" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-gray-200 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Bell className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Admin Notification Settings</h2>
          <p className="text-sm text-gray-500">
            Manage admin email recipients and notification preferences
          </p>
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2 text-green-700">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{successMessage}</span>
        </div>
      )}

      {/* Admin Email List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Admin Notification Recipients</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            These email addresses will receive admin notifications (new registrations, document submissions, weekly summary)
          </p>
        </div>
        <div className="p-5 space-y-3">
          {/* Current emails */}
          {adminEmails.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {adminEmails.map(email => (
                <span
                  key={email}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm"
                >
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveEmail(email)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">No admin emails configured yet.</p>
          )}

          {/* Add new email */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                placeholder="Add admin email address..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={handleAddEmail}
              className="flex items-center space-x-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Add</span>
            </button>
          </div>

          {/* Save button */}
          {emailsDirty && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveEmails}
                disabled={emailsSaving}
                className="flex items-center space-x-1.5 px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{emailsSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Notification preferences - only show if emails exist */}
      {adminEmails.length > 0 && preferences.length > 0 && (
        <>
          {/* Quick toggle for all admins */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Quick Controls</h3>
              <p className="text-xs text-gray-500 mt-0.5">Toggle notifications for all admin emails at once</p>
            </div>
            <div className="divide-y divide-gray-100">
              {adminNotificationTypes.map(({ key, label, description }) => {
                const allEnabled = preferences.every(p => p[key]);
                return (
                  <div key={key} className="flex items-center justify-between p-5">
                    <div className="flex-1 mr-4">
                      <h4 className="text-sm font-semibold text-gray-900">{label}</h4>
                      <p className="text-sm text-gray-500 mt-0.5">{description}</p>
                    </div>
                    <Toggle
                      enabled={allEnabled}
                      onChange={(value) => handleBulkToggle(key, value)}
                      disabled={saving?.startsWith('bulk:')}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-email controls */}
          {preferences.length > 1 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Per-Admin Controls</h3>
                <p className="text-xs text-gray-500 mt-0.5">Fine-tune notifications for individual admin emails</p>
              </div>
              <div className="divide-y divide-gray-100">
                {preferences.map(pref => (
                  <div key={pref.email} className="p-5">
                    <div className="flex items-center space-x-2 mb-3">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">{pref.email}</span>
                    </div>
                    <div className="space-y-3 pl-6">
                      {adminNotificationTypes.map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{label}</span>
                          <Toggle
                            enabled={pref[key]}
                            onChange={() => handleToggle(pref.email, key, pref[key])}
                            disabled={saving === `${pref.email}:${key}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Digest Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-gray-900">Upload Digest</h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Receive a summary of all documents uploaded across projects, grouped by project with file details and links
              </p>
            </div>

            {/* Bulk frequency selector */}
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex-1 mr-4">
                  <h4 className="text-sm font-semibold text-gray-900">Set All Admins</h4>
                  <p className="text-sm text-gray-500 mt-0.5">Set digest frequency for all admin emails at once</p>
                </div>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleBulkDigestChange(e.target.value as UploadDigestFrequency);
                  }}
                  disabled={saving === 'bulk:adminUploadDigest'}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white"
                >
                  <option value="" disabled>Choose...</option>
                  <option value="none">Off</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>

            {/* Per-email digest frequency */}
            <div className="divide-y divide-gray-100">
              {preferences.map(pref => (
                <div key={pref.email} className="flex items-center justify-between p-5">
                  <div className="flex items-center space-x-2 min-w-0 flex-1 mr-4">
                    <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">{pref.email}</span>
                  </div>
                  <select
                    value={pref.adminUploadDigest || 'none'}
                    onChange={(e) => handleDigestChange(pref.email, e.target.value as UploadDigestFrequency)}
                    disabled={saving === `${pref.email}:adminUploadDigest`}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white"
                  >
                    <option value="none">Off</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              ))}
            </div>

            {/* Manual send */}
            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Send Now</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Manually trigger a digest email to all opted-in admins</p>
                </div>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => handleSendDigest('daily')}
                    disabled={!!digestSending}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-sm border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{digestSending === 'daily' ? 'Sending...' : 'Daily (24h)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendDigest('weekly')}
                    disabled={!!digestSending}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-sm border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{digestSending === 'weekly' ? 'Sending...' : 'Weekly (7d)'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
