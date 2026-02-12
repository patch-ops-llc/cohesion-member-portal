import { useState, useEffect } from 'react';
import { Bell, Check, AlertCircle, Mail } from 'lucide-react';
import {
  getAdminPreferences,
  updateAdminPreference,
  updateAdminPreferencesBulk
} from '../../services/notifications';
import type { AdminNotificationPreferences } from '../../types';

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
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<AdminNotificationPreferences[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getAdminPreferences();
      setAdminEmails(result.adminEmails);
      setPreferences(result.preferences);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
    } finally {
      setLoading(false);
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

    // Optimistic update
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
      // Revert
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

    // Optimistic update
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
            Control which email notifications admin users receive
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

      {adminEmails.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-700 text-sm">
          <p className="font-semibold">No admin notification emails configured</p>
          <p className="mt-1">Set <code className="bg-amber-100 px-1 rounded">ADMIN_NOTIFICATION_EMAILS</code> in your environment variables to enable admin notifications.</p>
        </div>
      ) : (
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
        </>
      )}

      <p className="text-xs text-gray-400 text-center">
        Admin notification emails are configured via the ADMIN_NOTIFICATION_EMAILS environment variable.
      </p>
    </div>
  );
}
