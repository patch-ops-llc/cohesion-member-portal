import { useState, useEffect } from 'react';
import { Bell, Check, AlertCircle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getUserPreferences, updateUserPreferences } from '../../services/notifications';
import type { UserNotificationPreferences } from '../../types';

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

const notificationTypes = [
  {
    key: 'passwordReset' as const,
    label: 'Password Reset',
    description: 'Receive emails when you request a password reset'
  },
  {
    key: 'portalRegistration' as const,
    label: 'Registration Confirmation',
    description: 'Receive a welcome email when you register for the portal'
  },
  {
    key: 'documentSubmission' as const,
    label: 'Document Submissions',
    description: 'Get notified when your documents are successfully submitted'
  },
  {
    key: 'weeklyUpdate' as const,
    label: 'Weekly Updates',
    description: 'Receive a weekly summary of your project status and progress'
  }
];

export function NotificationSettings() {
  const [preferences, setPreferences] = useState<UserNotificationPreferences | null>(null);
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
      const prefs = await getUserPreferences();
      setPreferences(prefs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key: keyof UserNotificationPreferences) => {
    if (!preferences) return;

    const newValue = !preferences[key];
    setSaving(key);
    setError(null);

    // Optimistic update
    setPreferences(prev => prev ? { ...prev, [key]: newValue } : null);

    try {
      const updated = await updateUserPreferences({ [key]: newValue });
      setPreferences(updated);
      setSuccessMessage('Preference updated');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      // Revert on failure
      setPreferences(prev => prev ? { ...prev, [key]: !newValue } : null);
      setError(err instanceof Error ? err.message : 'Failed to update preference');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Projects
        </Link>
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
            <p className="text-sm text-gray-500">Choose which email notifications you'd like to receive</p>
          </div>
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2 text-green-700">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{successMessage}</span>
        </div>
      )}

      {/* Notification toggles */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
        {notificationTypes.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between p-5">
            <div className="flex-1 mr-4">
              <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{description}</p>
            </div>
            <Toggle
              enabled={preferences?.[key] ?? true}
              onChange={() => handleToggle(key)}
              disabled={saving === key}
            />
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-gray-400 text-center">
        Changes are saved automatically. Critical security emails (like password resets) are always sent regardless of preferences.
      </p>
    </div>
  );
}
