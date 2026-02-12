import React, { useState, useEffect, useCallback } from 'react';
import {
  Text,
  Flex,
  Box,
  Button,
  Divider,
  Alert,
  LoadingSpinner,
  ToggleGroup,
  hubspot
} from '@hubspot/ui-extensions';
import { BACKEND_URL } from '../config';

hubspot.extend(({ context }) => (
  <NotificationSettingsCard context={context} />
));

// Resend-only types: these get a "Resend" button instead of ON/OFF toggle
const resendTypes = [
  { key: 'passwordReset', label: 'Password Reset', description: 'Send a password reset link to the client' },
  { key: 'portalRegistration', label: 'Registration', description: 'Resend the welcome / registration email' }
];

// Toggleable notification types
const userNotificationTypes = [
  { key: 'documentSubmission', label: 'Document Submissions', description: 'Upload confirmation emails' },
  { key: 'weeklyUpdate', label: 'Weekly Updates', description: 'Weekly project summary' }
];

const adminNotificationTypes = [
  { key: 'adminRegistration', label: 'New Registrations', description: 'New client registration alerts' },
  { key: 'adminDocumentSubmission', label: 'Document Submissions', description: 'Client upload alerts' },
  { key: 'adminWeeklyUpdate', label: 'Weekly Summary', description: 'Weekly admin overview' }
];

function NotificationSettingsCard({ context }) {
  const recordId = context?.crm?.objectId ?? context?.crm?.recordId;

  const [email, setEmail] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(null); // key of the type currently resending
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [viewMode, setViewMode] = useState('client');

  // Load the project email first, then load preferences
  const loadData = useCallback(async () => {
    if (!recordId) {
      setError('No record context');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get the project from the backend - it returns the email along with documentData
      const projectRes = await hubspot.fetch(
        `${BACKEND_URL}/api/cards/projects/${recordId}`
      );
      const projectData = await projectRes.json();

      const contactEmail = projectData?.email;

      if (!contactEmail) {
        setError('No email found for this project. Ensure the project has an email property set in HubSpot.');
        setLoading(false);
        return;
      }

      setEmail(contactEmail);

      // Load notification preferences
      const prefsRes = await hubspot.fetch(
        `${BACKEND_URL}/api/notifications/cards/preferences/${encodeURIComponent(contactEmail)}`
      );
      const prefsData = await prefsRes.json();

      if (prefsData.success) {
        setPreferences(prefsData.preferences);
      } else {
        setError(prefsData.error || 'Failed to load preferences');
      }
    } catch (err) {
      setError(err.message || 'Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = useCallback(async (key, currentValue) => {
    if (!email || saving) return;

    setSaving(true);
    setError(null);

    const newValue = !currentValue;

    // Optimistic update
    setPreferences(prev => ({ ...prev, [key]: newValue }));

    try {
      const res = await hubspot.fetch(
        `${BACKEND_URL}/api/notifications/cards/preferences/${encodeURIComponent(email)}`,
        {
          method: 'PATCH',
          body: { [key]: newValue }
        }
      );

      const data = await res.json();

      if (data.success) {
        setPreferences(data.preferences);
        setSuccess(`${key} ${newValue ? 'enabled' : 'disabled'}`);
        setTimeout(() => setSuccess(''), 2000);
      } else {
        // Revert
        setPreferences(prev => ({ ...prev, [key]: currentValue }));
        setError(data.error || 'Failed to update');
      }
    } catch (err) {
      setPreferences(prev => ({ ...prev, [key]: currentValue }));
      setError(err.message || 'Failed to update preference');
    } finally {
      setSaving(false);
    }
  }, [email, saving]);

  const handleEnableAll = useCallback(async (types, enable) => {
    if (!email || saving) return;

    setSaving(true);
    setError(null);

    const updates = {};
    types.forEach(t => { updates[t.key] = enable; });

    // Optimistic update
    const prevPrefs = { ...preferences };
    setPreferences(prev => ({ ...prev, ...updates }));

    try {
      const res = await hubspot.fetch(
        `${BACKEND_URL}/api/notifications/cards/preferences/${encodeURIComponent(email)}`,
        {
          method: 'PATCH',
          body: updates
        }
      );

      const data = await res.json();

      if (data.success) {
        setPreferences(data.preferences);
        setSuccess(`All ${enable ? 'enabled' : 'disabled'}`);
        setTimeout(() => setSuccess(''), 2000);
      } else {
        setPreferences(prevPrefs);
        setError(data.error || 'Failed to update');
      }
    } catch (err) {
      setPreferences(prevPrefs);
      setError(err.message || 'Failed to update preferences');
    } finally {
      setSaving(false);
    }
  }, [email, saving, preferences]);

  const handleResend = useCallback(async (type) => {
    if (!email || resending) return;

    setResending(type.key);
    setError(null);

    try {
      const res = await hubspot.fetch(
        `${BACKEND_URL}/api/notifications/cards/resend/${encodeURIComponent(email)}`,
        {
          method: 'POST',
          body: { type: type.key }
        }
      );

      const data = await res.json();

      if (data.success) {
        setSuccess(data.message || `${type.label} email sent`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || `Failed to send ${type.label} email`);
      }
    } catch (err) {
      setError(err.message || `Failed to send ${type.label} email`);
    } finally {
      setResending(null);
    }
  }, [email, resending]);

  if (loading) {
    return (
      <Flex direction="column" gap="medium" align="center">
        <LoadingSpinner />
        <Text>Loading notification settings...</Text>
      </Flex>
    );
  }

  if (error && !preferences) {
    return (
      <Flex direction="column" gap="medium">
        <Alert title="Error" variant="error">
          {error}
        </Alert>
        <Button variant="secondary" size="small" onClick={loadData}>
          Retry
        </Button>
      </Flex>
    );
  }

  const currentTypes = viewMode === 'client' ? userNotificationTypes : adminNotificationTypes;

  return (
    <Box>
      {error && (
        <Alert title="Error" variant="error">
          {error}
        </Alert>
      )}
      {success && (
        <Alert title="Updated" variant="success">
          {success}
        </Alert>
      )}

      <Flex direction="column" gap="small">
        <Flex align="center" justify="between">
          <Text format={{ fontWeight: 'bold' }}>
            Notifications for: {email}
          </Text>
          <Button variant="secondary" size="small" onClick={loadData} disabled={loading}>
            Refresh
          </Button>
        </Flex>

        <Divider distance="small" />

        <ToggleGroup
          name="view_mode"
          label="View"
          options={[
            { value: 'client', label: 'Client Notifications', description: 'Emails sent to the client' },
            { value: 'admin', label: 'Admin Notifications', description: 'Emails sent to admin team' }
          ]}
          value={viewMode}
          onChange={setViewMode}
          toggleType="radioButtonList"
          variant="default"
          inline={true}
        />

        <Divider distance="small" />

        {/* Resend buttons (client view only) */}
        {viewMode === 'client' && resendTypes.map((type) => (
          <React.Fragment key={type.key}>
            <Flex align="center" justify="between" gap="small">
              <Flex direction="column" gap="flush">
                <Text format={{ fontWeight: 'bold' }}>{type.label}</Text>
                <Text variant="microcopy">{type.description}</Text>
              </Flex>
              <Button
                variant="primary"
                size="small"
                onClick={() => handleResend(type)}
                disabled={resending === type.key}
              >
                {resending === type.key ? 'Sending...' : 'Resend'}
              </Button>
            </Flex>
            <Divider distance="flush" />
          </React.Fragment>
        ))}

        {/* Toggleable notification preferences */}
        {currentTypes.map((type) => {
          const isEnabled = preferences?.[type.key] ?? true;
          return (
            <React.Fragment key={type.key}>
              <Flex align="center" justify="between" gap="small">
                <Flex direction="column" gap="flush">
                  <Text format={{ fontWeight: 'bold' }}>{type.label}</Text>
                  <Text variant="microcopy">{type.description}</Text>
                </Flex>
                <Button
                  variant={isEnabled ? 'primary' : 'secondary'}
                  size="small"
                  onClick={() => handleToggle(type.key, isEnabled)}
                  disabled={saving}
                >
                  {isEnabled ? 'ON' : 'OFF'}
                </Button>
              </Flex>
              <Divider distance="flush" />
            </React.Fragment>
          );
        })}

        <Flex justify="end" gap="small">
          <Button
            variant="primary"
            size="small"
            onClick={() => handleEnableAll(currentTypes, true)}
            disabled={saving}
          >
            Enable All
          </Button>
          <Button
            variant="destructive"
            size="small"
            onClick={() => handleEnableAll(currentTypes, false)}
            disabled={saving}
          >
            Disable All
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}
