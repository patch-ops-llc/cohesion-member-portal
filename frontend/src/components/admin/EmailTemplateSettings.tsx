import { useState, useEffect } from 'react';
import { Mail, Save, RotateCcw, ChevronDown, ChevronRight, AlertCircle, Check, Eye, EyeOff, Info } from 'lucide-react';
import {
  getEmailTemplates,
  updateEmailTemplate,
  resetEmailTemplate
} from '../../services/notifications';
import type { EmailTemplate } from '../../types';

export function EmailTemplateSettings() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, Partial<EmailTemplate>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getEmailTemplates();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load email templates');
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = (key: string) => {
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    const tpl = templates.find(t => t.key === key);
    if (tpl && !editState[key]) {
      setEditState(prev => ({
        ...prev,
        [key]: {
          senderName: tpl.senderName,
          senderEmail: tpl.senderEmail,
          subject: tpl.subject,
          body: tpl.body
        }
      }));
    }
  };

  const handleFieldChange = (key: string, field: string, value: string) => {
    setEditState(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }));
  };

  const handleSave = async (key: string) => {
    const edits = editState[key];
    if (!edits) return;

    setSaving(key);
    setError(null);

    try {
      const updated = await updateEmailTemplate(key, {
        senderName: edits.senderName,
        senderEmail: edits.senderEmail,
        subject: edits.subject,
        body: edits.body
      });
      setTemplates(prev => prev.map(t => t.key === key ? updated : t));
      setEditState(prev => ({
        ...prev,
        [key]: {
          senderName: updated.senderName,
          senderEmail: updated.senderEmail,
          subject: updated.subject,
          body: updated.body
        }
      }));
      setSuccessMessage(`"${updated.label}" template saved`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async (key: string) => {
    setSaving(key);
    setError(null);

    try {
      const updated = await resetEmailTemplate(key);
      setTemplates(prev => prev.map(t => t.key === key ? updated : t));
      setEditState(prev => ({
        ...prev,
        [key]: {
          senderName: updated.senderName,
          senderEmail: updated.senderEmail,
          subject: updated.subject,
          body: updated.body
        }
      }));
      setSuccessMessage(`"${updated.label}" reset to default`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset template');
    } finally {
      setSaving(null);
    }
  };

  const hasChanges = (key: string) => {
    const tpl = templates.find(t => t.key === key);
    const edits = editState[key];
    if (!tpl || !edits) return false;
    return (
      edits.senderName !== tpl.senderName ||
      edits.senderEmail !== tpl.senderEmail ||
      edits.subject !== tpl.subject ||
      edits.body !== tpl.body
    );
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 bg-gray-200 rounded" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 bg-gray-200 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Email Templates</h2>
          <p className="text-sm text-gray-500">
            Customize the sender, subject line, and body of each email type
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

      {/* Template list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
        {templates.map(tpl => {
          const isExpanded = expandedKey === tpl.key;
          const edits = editState[tpl.key];
          const isPreviewing = previewKey === tpl.key;
          const changed = hasChanges(tpl.key);

          return (
            <div key={tpl.key}>
              {/* Collapsed row */}
              <button
                type="button"
                onClick={() => handleExpand(tpl.key)}
                className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-gray-900">{tpl.label}</h4>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{tpl.key}</p>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-xs text-gray-400 hidden sm:inline">
                    {tpl.senderName} &lt;{tpl.senderEmail}&gt;
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Expanded editor */}
              {isExpanded && edits && (
                <div className="px-5 pb-5 space-y-4 border-t border-gray-100 bg-gray-50">
                  {/* Variables info */}
                  {tpl.variables.length > 0 && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-start space-x-2">
                        <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-blue-700">Available variables</p>
                          <p className="text-xs text-blue-600 mt-1 font-mono">
                            {tpl.variables.map(v => `{{${v}}}`).join('  ')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sender fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Sender Name</label>
                      <input
                        type="text"
                        value={edits.senderName || ''}
                        onChange={(e) => handleFieldChange(tpl.key, 'senderName', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Sender Email</label>
                      <input
                        type="email"
                        value={edits.senderEmail || ''}
                        onChange={(e) => handleFieldChange(tpl.key, 'senderEmail', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Subject</label>
                    <input
                      type="text"
                      value={edits.subject || ''}
                      onChange={(e) => handleFieldChange(tpl.key, 'subject', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  </div>

                  {/* Body */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-gray-700">Email Body (HTML)</label>
                      <button
                        type="button"
                        onClick={() => setPreviewKey(isPreviewing ? null : tpl.key)}
                        className="flex items-center space-x-1 text-xs text-primary hover:text-primary/80"
                      >
                        {isPreviewing ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        <span>{isPreviewing ? 'Edit' : 'Preview'}</span>
                      </button>
                    </div>
                    {isPreviewing ? (
                      <div
                        className="w-full min-h-[200px] p-4 border border-gray-300 rounded-lg bg-white text-sm"
                        dangerouslySetInnerHTML={{ __html: edits.body || '' }}
                      />
                    ) : (
                      <textarea
                        value={edits.body || ''}
                        onChange={(e) => handleFieldChange(tpl.key, 'body', e.target.value)}
                        rows={10}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary font-mono"
                      />
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => handleReset(tpl.key)}
                      disabled={saving === tpl.key}
                      className="flex items-center space-x-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Reset to Default</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSave(tpl.key)}
                      disabled={saving === tpl.key || !changed}
                      className="flex items-center space-x-1.5 px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{saving === tpl.key ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 text-center">
        Use {'{{variableName}}'} syntax in subject and body fields to insert dynamic values.
      </p>
    </div>
  );
}
