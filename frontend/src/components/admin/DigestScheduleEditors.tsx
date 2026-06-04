import { useState, useEffect } from 'react';
import { Clock, Save, Check, AlertCircle } from 'lucide-react';
import {
  getWeeklyDigestSchedule,
  setWeeklyDigestSchedule,
  getUploadDigestSchedule,
  setUploadDigestSchedule
} from '../../services/notifications';
import type { WeeklyClientDigestSchedule, UploadDigestSchedule } from '../../types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TZ_LABELS: Record<string, string> = {
  'America/New_York': 'Eastern (New York)',
  'America/Chicago': 'Central (Chicago)',
  'America/Denver': 'Mountain (Denver)',
  'America/Phoenix': 'Mountain - no DST (Phoenix)',
  'America/Los_Angeles': 'Pacific (Los Angeles)',
  'America/Anchorage': 'Alaska (Anchorage)',
  'Pacific/Honolulu': 'Hawaii (Honolulu)'
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toTimeString(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

function parseTimeString(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : 0, minute: Number.isFinite(m) ? m : 0 };
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}
function Field({ label, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

const selectClass =
  'px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white';

function StatusLine({ message, error }: { message: string | null; error: string | null }) {
  if (error) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-red-600">
        <AlertCircle className="h-4 w-4" />
        {error}
      </span>
    );
  }
  if (message) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-green-600">
        <Check className="h-4 w-4" />
        {message}
      </span>
    );
  }
  return null;
}

// ─── Client weekly digest schedule ─────────────────────────────────────
export function ClientDigestScheduleEditor() {
  const [schedule, setSchedule] = useState<WeeklyClientDigestSchedule | null>(null);
  const [timezones, setTimezones] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWeeklyDigestSchedule()
      .then(({ schedule, timezones }) => {
        setSchedule(schedule);
        setTimezones(timezones);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load schedule'))
      .finally(() => setLoading(false));
  }, []);

  const update = (patch: Partial<WeeklyClientDigestSchedule>) => {
    setSchedule(prev => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = async () => {
    if (!schedule) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await setWeeklyDigestSchedule(schedule);
      setSchedule(saved);
      setMessage('Schedule saved');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-400">Loading schedule…</p>;
  if (!schedule) return <p className="text-sm text-red-500">{error || 'Could not load schedule'}</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Day">
          <select
            value={schedule.dayOfWeek}
            onChange={(e) => update({ dayOfWeek: Number(e.target.value) })}
            className={selectClass}
          >
            {DAY_NAMES.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
        </Field>
        <Field label="Time">
          <input
            type="time"
            value={toTimeString(schedule.hour, schedule.minute)}
            onChange={(e) => update(parseTimeString(e.target.value))}
            className={selectClass}
          />
        </Field>
        <Field label="Timezone">
          <select
            value={schedule.timezone}
            onChange={(e) => update({ timezone: e.target.value })}
            className={selectClass}
          >
            {timezones.map(tz => (
              <option key={tz} value={tz}>{TZ_LABELS[tz] || tz}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-1.5 px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          <span>{saving ? 'Saving…' : 'Save Schedule'}</span>
        </button>
        <StatusLine message={message} error={error} />
      </div>
    </div>
  );
}

// ─── Admin upload digest schedule ──────────────────────────────────────
export function UploadDigestScheduleEditor() {
  const [schedule, setSchedule] = useState<UploadDigestSchedule | null>(null);
  const [timezones, setTimezones] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUploadDigestSchedule()
      .then(({ schedule, timezones }) => {
        setSchedule(schedule);
        setTimezones(timezones);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load schedule'))
      .finally(() => setLoading(false));
  }, []);

  const update = (patch: Partial<UploadDigestSchedule>) => {
    setSchedule(prev => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = async () => {
    if (!schedule) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await setUploadDigestSchedule(schedule);
      setSchedule(saved);
      setMessage('Schedule saved');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-400">Loading schedule…</p>;
  if (!schedule) return <p className="text-sm text-red-500">{error || 'Could not load schedule'}</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Send time applies to both the daily and weekly digests. The day below only affects the weekly digest.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Send Time">
          <input
            type="time"
            value={toTimeString(schedule.hour, schedule.minute)}
            onChange={(e) => update(parseTimeString(e.target.value))}
            className={selectClass}
          />
        </Field>
        <Field label="Weekly Day">
          <select
            value={schedule.weeklyDayOfWeek}
            onChange={(e) => update({ weeklyDayOfWeek: Number(e.target.value) })}
            className={selectClass}
          >
            {DAY_NAMES.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
        </Field>
        <Field label="Timezone">
          <select
            value={schedule.timezone}
            onChange={(e) => update({ timezone: e.target.value })}
            className={selectClass}
          >
            {timezones.map(tz => (
              <option key={tz} value={tz}>{TZ_LABELS[tz] || tz}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-1.5 px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          <span>{saving ? 'Saving…' : 'Save Schedule'}</span>
        </button>
        <StatusLine message={message} error={error} />
      </div>
    </div>
  );
}

// Small icon used by callers that want a header glyph.
export { Clock as ScheduleIcon };
