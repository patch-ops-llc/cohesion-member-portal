import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw, Send, Mail, CheckCircle2, XCircle, AlertCircle, Check } from 'lucide-react';
import {
  getWeeklyDigestClients,
  setClientWeeklyDigest,
  setClientsWeeklyDigestBulk,
  sendWeeklyClientDigest
} from '../../services/notifications';
import { InlineLoader } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorBoundary';
import type { WeeklyDigestClient } from '../../types';

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
        enabled ? 'bg-primary' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
          enabled ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function WeeklyDigestClients() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clients, setClients] = useState<WeeklyDigestClient[]>([]);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { isLoading, error: loadError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'weekly-digest-clients'],
    queryFn: async () => {
      const data = await getWeeklyDigestClients();
      setClients(data);
      return data;
    }
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter(
      c => c.email.toLowerCase().includes(q) || (c.displayName || '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  const flash = (msg: string, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(null), 4000);
    } else {
      setMessage(msg);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const toggleSelect = (email: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selected.has(c.email));
  const toggleSelectAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach(c => next.delete(c.email));
      } else {
        filtered.forEach(c => next.add(c.email));
      }
      return next;
    });
  };

  const handleToggleClient = async (email: string, value: boolean) => {
    setSavingEmail(email);
    setError(null);
    setClients(prev => prev.map(c => (c.email === email ? { ...c, weeklyUpdate: value } : c)));
    try {
      await setClientWeeklyDigest(email, value);
    } catch (err) {
      setClients(prev => prev.map(c => (c.email === email ? { ...c, weeklyUpdate: !value } : c)));
      flash(err instanceof Error ? err.message : 'Failed to update client', true);
    } finally {
      setSavingEmail(null);
    }
  };

  const handleBulkSetEnabled = async (enabled: boolean) => {
    const emails = [...selected];
    if (emails.length === 0) return;
    setBulkBusy(true);
    setError(null);
    const prev = clients;
    setClients(prev.map(c => (selected.has(c.email) ? { ...c, weeklyUpdate: enabled } : c)));
    try {
      await setClientsWeeklyDigestBulk(emails, enabled);
      flash(`${enabled ? 'Enabled' : 'Disabled'} weekly digest for ${emails.length} client(s)`);
    } catch (err) {
      setClients(prev);
      flash(err instanceof Error ? err.message : 'Failed to update clients', true);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleSendSelected = async () => {
    const emails = [...selected];
    if (emails.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const result = await sendWeeklyClientDigest(emails);
      flash(result.message);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed to send digest', true);
    } finally {
      setBulkBusy(false);
    }
  };

  if (isLoading) {
    return <InlineLoader message="Loading clients..." />;
  }

  if (loadError) {
    return (
      <ErrorMessage
        message={loadError instanceof Error ? loadError.message : 'Failed to load clients'}
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="space-y-3">
      {message && (
        <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2 text-green-700 text-sm">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search + refresh */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients by name or email..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center space-x-1.5 px-3 py-2 text-sm border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm text-gray-600 mr-1">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => handleBulkSetEnabled(true)}
            disabled={bulkBusy}
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            <span>Enable</span>
          </button>
          <button
            type="button"
            onClick={() => handleBulkSetEnabled(false)}
            disabled={bulkBusy}
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5 text-gray-500" />
            <span>Disable</span>
          </button>
          <button
            type="button"
            onClick={handleSendSelected}
            disabled={bulkBusy}
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{bulkBusy ? 'Working...' : 'Send to selected'}</span>
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      )}

      {/* Client table */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-4 text-center">
          {search ? 'No clients match your search' : 'No clients with projects found'}
        </p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Projects</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Weekly Digest</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filtered.map(client => (
                <tr key={client.email} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(client.email)}
                      onChange={() => toggleSelect(client.email)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center space-x-2 min-w-0">
                      <Mail className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        {client.displayName && (
                          <p className="text-sm font-medium text-gray-900 truncate">{client.displayName}</p>
                        )}
                        <p className="text-xs text-gray-500 truncate">{client.email}</p>
                      </div>
                      {!client.registered && (
                        <span className="text-[10px] uppercase tracking-wide text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          Not registered
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-sm text-gray-500">{client.projectCount}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end">
                      <Toggle
                        enabled={client.weeklyUpdate}
                        onChange={(v) => handleToggleClient(client.email, v)}
                        disabled={savingEmail === client.email}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Showing {filtered.length} of {clients.length} client(s). A client toggled off won't receive the weekly
        digest, even on a manual send.
      </p>
    </div>
  );
}
