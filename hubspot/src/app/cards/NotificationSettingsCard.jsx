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
  Input,
  TextArea,
  hubspot
} from '@hubspot/ui-extensions';
import { BACKEND_URL } from '../config';

hubspot.extend(({ context }) => (
  <NotificationSettingsCard context={context} />
));

const resendTypes = [
  { key: 'passwordReset', label: 'Password Reset', description: 'Send a password reset link to the client' },
  { key: 'portalRegistration', label: 'Registration', description: 'Resend the welcome / registration email' }
];

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
  const [resending, setResending] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [viewMode, setViewMode] = useState('client');

  // Email template state
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateEdits, setTemplateEdits] = useState({});
  const [templateSaving, setTemplateSaving] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  const loadData = useCallback(async () => {
    if (!recordId) {
      setError('No record context');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
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

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setError(null);

    try {
      const res = await hubspot.fetch(
        `${BACKEND_URL}/api/email-templates/cards/all`
      );
      const data = await res.json();

      if (data.success) {
        setTemplates(data.templates);
      } else {
        setError(data.error || 'Failed to load email templates');
      }
    } catch (err) {
      setError(err.message || 'Failed to load email templates');
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (viewMode === 'templates' && templates.length === 0) {
      loadTemplates();
    }
  }, [viewMode, templates.length, loadTemplates]);

  const handleToggle = useCallback(async (key, currentValue) => {
    if (!email || saving) return;

    setSaving(true);
    setError(null);
    const newValue = !currentValue;
    setPreferences(prev => ({ ...prev, [key]: newValue }));

    try {
      const res = await hubspot.fetch(
        `${BACKEND_URL}/api/notifications/cards/preferences/${encodeURIComponent(email)}`,
        { method: 'PATCH', body: { [key]: newValue } }
      );
      const data = await res.json();

      if (data.success) {
        setPreferences(data.preferences);
        setSuccess(`${key} ${newValue ? 'enabled' : 'disabled'}`);
        setTimeout(() => setSuccess(''), 2000);
      } else {
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
    const prevPrefs = { ...preferences };
    setPreferences(prev => ({ ...prev, ...updates }));

    try {
      const res = await hubspot.fetch(
        `${BACKEND_URL}/api/notifications/cards/preferences/${encodeURIComponent(email)}`,
        { method: 'PATCH', body: updates }
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: type.key })
        }
      );

      let data;
      try {
        data = await res.json();
      } catch (_parseErr) {
        setError(`Server returned an invalid response (HTTP ${res.status}). Please try again.`);
        return;
      }

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

  // ─── Template handlers ─────────────────────────────────────────────
  const handleSelectTemplate = useCallback((tpl) => {
    setSelectedTemplate(tpl);
    setTemplateEdits({
      senderName: tpl.senderName,
      senderEmail: tpl.senderEmail,
      subject: tpl.subject,
      body: tpl.body
    });
    if (email) setTestRecipient(email);
  }, [email]);

  const handleSendTestEmail = useCallback(async () => {
    if (!selectedTemplate || sendingTestEmail || !testRecipient) return;

    setSendingTestEmail(true);
    setError(null);

    try {
      const res = await hubspot.fetch(
        `${BACKEND_URL}/api/email-templates/cards/test/${selectedTemplate.key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientEmail: testRecipient })
        }
      );

      let data;
      try {
        data = await res.json();
      } catch (_parseErr) {
        setError(`Server returned an invalid response (HTTP ${res.status}).`);
        return;
      }

      if (data.success) {
        setSuccess(data.message || 'Test email sent');
        setTimeout(() => setSuccess(''), 4000);
      } else {
        setError(data.error || 'Failed to send test email');
      }
    } catch (err) {
      setError(err.message || 'Failed to send test email');
    } finally {
      setSendingTestEmail(false);
    }
  }, [selectedTemplate, testRecipient, sendingTestEmail]);

  const handleSaveTemplate = useCallback(async () => {
    if (!selectedTemplate || templateSaving) return;

    setTemplateSaving(true);
    setError(null);

    try {
      const res = await hubspot.fetch(
        `${BACKEND_URL}/api/email-templates/cards/${selectedTemplate.key}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(templateEdits)
        }
      );
      const data = await res.json();

      if (data.success) {
        setTemplates(prev => prev.map(t => t.key === selectedTemplate.key ? data.template : t));
        setSelectedTemplate(data.template);
        setSuccess(`"${data.template.label}" template saved`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to save template');
      }
    } catch (err) {
      setError(err.message || 'Failed to save template');
    } finally {
      setTemplateSaving(false);
    }
  }, [selectedTemplate, templateEdits, templateSaving]);

  if (loading) {
    return (
      <Flex direction="column" gap="medium" align="center">
        <LoadingSpinner />
        <Text>Loading notification settings...</Text>
      </Flex>
    );
  }

  if (error && !preferences && viewMode !== 'templates') {
    return (
      <Flex direction="column" gap="medium">
        <Alert title="Error" variant="error">{error}</Alert>
        <Button variant="secondary" size="small" onClick={loadData}>Retry</Button>
      </Flex>
    );
  }

  const currentTypes = viewMode === 'client' ? userNotificationTypes : adminNotificationTypes;

  return (
    <Box>
      {error && (
        <Alert title="Error" variant="error">{error}</Alert>
      )}
      {success && (
        <Alert title="Updated" variant="success">{success}</Alert>
      )}

      <Flex direction="column" gap="small">
        <Flex align="center" justify="between">
          <Text format={{ fontWeight: 'bold' }}>
            {viewMode === 'templates' ? 'Email Templates' : `Notifications for: ${email}`}
          </Text>
          <Button variant="secondary" size="small" onClick={viewMode === 'templates' ? loadTemplates : loadData} disabled={loading || templatesLoading}>
            Refresh
          </Button>
        </Flex>

        <Divider distance="small" />

        <ToggleGroup
          name="view_mode"
          label="View"
          options={[
            { value: 'client', label: 'Client Notifications', description: 'Emails sent to the client' },
            { value: 'admin', label: 'Admin Notifications', description: 'Emails sent to admin team' },
            { value: 'templates', label: 'Email Templates', description: 'Edit sender, subject, and body' }
          ]}
          value={viewMode}
          onChange={setViewMode}
          toggleType="radioButtonList"
          variant="default"
          inline={true}
        />

        <Divider distance="small" />

        {/* ─── Client / Admin notification views ─────────────────────── */}
        {viewMode !== 'templates' && (
          <>
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
              <Button variant="primary" size="small" onClick={() => handleEnableAll(currentTypes, true)} disabled={saving}>
                Enable All
              </Button>
              <Button variant="destructive" size="small" onClick={() => handleEnableAll(currentTypes, false)} disabled={saving}>
                Disable All
              </Button>
            </Flex>
          </>
        )}

        {/* ─── Email Templates view ──────────────────────────────────── */}
        {viewMode === 'templates' && (
          <>
            {templatesLoading && (
              <Flex direction="column" gap="medium" align="center">
                <LoadingSpinner />
                <Text>Loading templates...</Text>
              </Flex>
            )}

            {!templatesLoading && !selectedTemplate && templates.length > 0 && (
              <>
                {templates.map((tpl) => (
                  <React.Fragment key={tpl.key}>
                    <Flex align="center" justify="between" gap="small">
                      <Flex direction="column" gap="flush">
                        <Text format={{ fontWeight: 'bold' }}>{tpl.label}</Text>
                        <Text variant="microcopy">{tpl.senderName} &lt;{tpl.senderEmail}&gt;</Text>
                      </Flex>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => handleSelectTemplate(tpl)}
                      >
                        Edit
                      </Button>
                    </Flex>
                    <Divider distance="flush" />
                  </React.Fragment>
                ))}
              </>
            )}

            {!templatesLoading && selectedTemplate && (
              <Flex direction="column" gap="small">
                <Flex align="center" justify="between">
                  <Text format={{ fontWeight: 'bold' }}>
                    Editing: {selectedTemplate.label}
                  </Text>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setSelectedTemplate(null)}
                  >
                    Back
                  </Button>
                </Flex>

                {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                  <Alert title="Available variables" variant="info">
                    {selectedTemplate.variables.map(v => `{{${v}}}`).join('  ')}
                  </Alert>
                )}

                <Input
                  label="Sender Name"
                  name="senderName"
                  value={templateEdits.senderName || ''}
                  onChange={(val) => setTemplateEdits(prev => ({ ...prev, senderName: val }))}
                />

                <Input
                  label="Sender Email"
                  name="senderEmail"
                  value={templateEdits.senderEmail || ''}
                  onChange={(val) => setTemplateEdits(prev => ({ ...prev, senderEmail: val }))}
                />

                <Input
                  label="Subject"
                  name="subject"
                  value={templateEdits.subject || ''}
                  onChange={(val) => setTemplateEdits(prev => ({ ...prev, subject: val }))}
                />

                <TextArea
                  label="Email Body (HTML)"
                  name="body"
                  value={templateEdits.body || ''}
                  onChange={(val) => setTemplateEdits(prev => ({ ...prev, body: val }))}
                  rows={8}
                />

                <Divider distance="small" />

                <Text format={{ fontWeight: 'bold' }}>Send Test Email</Text>
                <Text variant="microcopy">Subject will be prefixed with [TEST]. Variables are filled with sample data.</Text>
                <Flex align="end" gap="small">
                  <Input
                    label="Recipient"
                    name="testRecipient"
                    value={testRecipient}
                    onChange={setTestRecipient}
                    placeholder="recipient@example.com"
                  />
                  <Button
                    variant="primary"
                    size="small"
                    onClick={handleSendTestEmail}
                    disabled={sendingTestEmail || !testRecipient}
                  >
                    {sendingTestEmail ? 'Sending...' : 'Send Test'}
                  </Button>
                </Flex>

                <Divider distance="small" />

                <Flex justify="end" gap="small">
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setSelectedTemplate(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="small"
                    onClick={handleSaveTemplate}
                    disabled={templateSaving}
                  >
                    {templateSaving ? 'Saving...' : 'Save Template'}
                  </Button>
                </Flex>
              </Flex>
            )}
          </>
        )}
      </Flex>
    </Box>
  );
}
