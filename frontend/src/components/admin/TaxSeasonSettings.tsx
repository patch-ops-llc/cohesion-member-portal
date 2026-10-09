import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarClock, Play, Loader2, AlertTriangle, CheckCircle2, XCircle,
  Save, ListChecks, Wand2, RefreshCw
} from 'lucide-react';
import clsx from 'clsx';
import api from '../../services/api';
import { InlineLoader } from '../shared/LoadingSpinner';
import type {
  BackfillResult, RolloverPlan, RolloverRun, SeasonOverview, TaxSeasonSettings as Season
} from '../../types';

interface SeasonResponse {
  settings: Season;
  overview: SeasonOverview;
  run: RolloverRun;
}

const POLL_INTERVAL_MS = 2000;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function TaxSeasonSettings() {
  const [settings, setSettings] = useState<Season | null>(null);
  const [overview, setOverview] = useState<SeasonOverview | null>(null);
  const [run, setRun] = useState<RolloverRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await api.get<SeasonResponse>('/admin/tax-season');
    setSettings(response.data.settings);
    setOverview(response.data.overview);
    setRun(response.data.run);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Failed to load tax season settings'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [load]);

  if (isLoading) return <InlineLoader message="Loading tax season settings..." />;
  if (!settings || !overview) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error || 'Tax season settings unavailable'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Keyed on the saved values so the card remounts when the server's
          settings change underneath it — a completed rollover sets the season,
          and a card still showing a blank year would send "clear the season"
          on the next save. */}
      <CurrentSeasonCard
        key={`${settings.currentTaxYear}-${settings.hidePriorYearProjects}`}
        settings={settings}
        onSaved={setSettings}
        onError={setError}
      />

      <SeasonBreakdownCard
        overview={overview}
        onRefresh={async () => {
          try {
            await load();
          } catch (err) {
            setError(errorMessage(err, 'Failed to refresh'));
          }
        }}
      />

      <BackfillCard
        overview={overview}
        onApplied={async () => {
          try {
            await load();
          } catch (err) {
            setError(errorMessage(err, 'Failed to refresh'));
          }
        }}
      />

      <RolloverCard
        settings={settings}
        initialRun={run}
        onFinished={async () => {
          try {
            await load();
          } catch (err) {
            setError(errorMessage(err, 'Failed to refresh'));
          }
        }}
      />
    </div>
  );
}

// ─── Current season ────────────────────────────────────────────────────

function CurrentSeasonCard({
  settings,
  onSaved,
  onError
}: {
  settings: Season;
  onSaved: (next: Season) => void;
  onError: (message: string | null) => void;
}) {
  const [yearInput, setYearInput] = useState(
    settings.currentTaxYear === null ? '' : String(settings.currentTaxYear)
  );
  const [hidePrior, setHidePrior] = useState(settings.hidePriorYearProjects);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const trimmed = yearInput.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);

    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2099)) {
      onError('Enter a four-digit year between 2000 and 2099, or leave it blank to turn the filter off');
      return;
    }

    setIsSaving(true);
    onError(null);
    try {
      const response = await api.put<{ settings: Season }>('/admin/tax-season', {
        currentTaxYear: parsed,
        hidePriorYearProjects: hidePrior
      });
      onSaved(response.data.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      onError(errorMessage(err, 'Failed to save tax season settings'));
    } finally {
      setIsSaving(false);
    }
  };

  const filterActive = settings.currentTaxYear !== null && settings.hidePriorYearProjects;

  return (
    <div className="card p-6">
      <div className="flex items-center space-x-3 mb-1">
        <CalendarClock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-gray-900">Current season</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Controls which projects clients see in the portal. Leave the year blank to show every
        project regardless of season.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-5">
        <div className="sm:w-48">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Current tax year</label>
          <input
            type="text"
            inputMode="numeric"
            value={yearInput}
            onChange={(e) => setYearInput(e.target.value)}
            placeholder="Not set"
            className="input"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary flex items-center space-x-2"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>Save</span>
        </button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center space-x-1.5">
            <CheckCircle2 className="h-4 w-4" />
            <span>Saved</span>
          </span>
        )}
      </div>

      <label className="flex items-start space-x-3 cursor-pointer">
        <input
          type="checkbox"
          checked={hidePrior}
          onChange={(e) => setHidePrior(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <span className="text-sm">
          <span className="font-medium text-gray-900">Hide prior-season projects from clients</span>
          <span className="block text-gray-500">
            Projects from earlier years disappear from the client's project list and can no longer
            be opened. Staff and HubSpot are unaffected. Projects with no known year always stay
            visible.
          </span>
        </span>
      </label>

      <div
        className={clsx(
          'mt-5 rounded-lg px-4 py-3 text-sm',
          filterActive
            ? 'bg-primary-50 border border-primary-200 text-primary'
            : 'bg-gray-50 border border-gray-200 text-gray-600'
        )}
      >
        {filterActive
          ? `Clients currently see ${settings.currentTaxYear} projects and newer.`
          : 'Clients currently see every tax project they are attached to.'}
      </div>
    </div>
  );
}

// ─── Breakdown ─────────────────────────────────────────────────────────

function SeasonBreakdownCard({
  overview,
  onRefresh
}: {
  overview: SeasonOverview;
  onRefresh: () => Promise<void>;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center space-x-3">
          <ListChecks className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-gray-900">Projects by season</h2>
        </div>
        <button onClick={refresh} disabled={isRefreshing} className="btn-ghost">
          <RefreshCw className={clsx('h-4 w-4', isRefreshing && 'animate-spin')} />
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        {overview.taxProjects} tax projects in HubSpot ({overview.totalProjects} records total,
        advisory excluded).
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Season
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Projects
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Year from name only
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {overview.years.map(({ year, count, fromNameOnly }) => (
              <tr key={year === null ? 'unknown' : year}>
                <td className="px-4 py-2.5 font-medium text-gray-900">
                  {year === null ? (
                    <span className="text-gray-500 italic">No year</span>
                  ) : (
                    year
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-900">{count}</td>
                <td className="px-4 py-2.5 text-right">
                  {fromNameOnly > 0 ? (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                      {fromNameOnly}
                    </span>
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Backfill ──────────────────────────────────────────────────────────

function BackfillCard({
  overview,
  onApplied
}: {
  overview: SeasonOverview;
  onApplied: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<BackfillResult | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<BackfillResult | null>(null);

  const run = async (dryRun: boolean) => {
    setIsWorking(true);
    setError(null);
    try {
      const response = await api.post<{ result: BackfillResult }>('/admin/tax-season/backfill', { dryRun });
      if (dryRun) {
        setPreview(response.data.result);
      } else {
        setApplied(response.data.result);
        setPreview(null);
        await onApplied();
      }
    } catch (err) {
      setError(errorMessage(err, 'Backfill failed'));
    } finally {
      setIsWorking(false);
    }
  };

  if (overview.backfillable === 0 && !applied) {
    return (
      <div className="card p-6">
        <div className="flex items-center space-x-3 mb-1">
          <Wand2 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-gray-900">Tax year backfill</h2>
        </div>
        <p className="text-sm text-gray-500">
          Every project whose name contains a year already has its Tax Year property set. Nothing
          to backfill.
          {overview.missingTaxYear > 0 && (
            <>
              {' '}
              {overview.missingTaxYear} project{overview.missingTaxYear === 1 ? '' : 's'} still
              have no year at all — those stay visible to clients.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center space-x-3 mb-1">
        <Wand2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-gray-900">Tax year backfill</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        {overview.backfillable} project{overview.backfillable === 1 ? '' : 's'} have a year in the
        name but no Tax Year property. Stamping the property makes the season filter depend on real
        data instead of on parsing names.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {applied && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">
          Set Tax Year on {applied.updated} project{applied.updated === 1 ? '' : 's'}.
          {applied.failed > 0 && ` ${applied.failed} failed.`}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => run(true)} disabled={isWorking} className="btn-outline flex items-center space-x-2">
          {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
          <span>Preview</span>
        </button>
        {preview && preview.changes.length > 0 && (
          <button onClick={() => run(false)} disabled={isWorking} className="btn-primary flex items-center space-x-2">
            {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>Apply to {preview.changes.length} project{preview.changes.length === 1 ? '' : 's'}</span>
          </button>
        )}
      </div>

      {preview && (
        <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
          {preview.changes.map(change => (
            <div key={change.projectId} className="px-4 py-2 flex items-center justify-between text-sm">
              <span className="text-gray-900 truncate">{change.name}</span>
              <span className="ml-3 shrink-0 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                {change.year}
              </span>
            </div>
          ))}
          {preview.changes.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-500">Nothing to backfill.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Rollover ──────────────────────────────────────────────────────────

function RolloverCard({
  settings,
  initialRun,
  onFinished
}: {
  settings: Season;
  initialRun: RolloverRun | null;
  onFinished: () => Promise<void>;
}) {
  const suggestedYear = (settings.currentTaxYear ?? new Date().getFullYear() - 1) + 1;

  const [targetYear, setTargetYear] = useState(String(suggestedYear));
  const [plan, setPlan] = useState<RolloverPlan | null>(null);
  const [confirmYear, setConfirmYear] = useState('');
  const [run, setRun] = useState<RolloverRun | null>(initialRun);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const isRunning = run?.status === 'running';

  // Poll while a run is in flight; the request that started it returned
  // immediately, so this is the only source of progress.
  useEffect(() => {
    if (!isRunning) {
      clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const response = await api.get<{ run: RolloverRun }>('/admin/tax-season/rollover/status');
        setRun(response.data.run);
        if (response.data.run.status !== 'running') {
          clearInterval(pollRef.current);
          setPlan(null);
          setConfirmYear('');
          await onFinished();
        }
      } catch {
        // Transient poll failures are not worth surfacing; the next tick retries.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(pollRef.current);
  }, [isRunning, onFinished]);

  const parsedTarget = Number(targetYear.trim());
  const targetIsValid = Number.isInteger(parsedTarget) && parsedTarget >= 2000 && parsedTarget <= 2099;

  const handlePreview = async () => {
    if (!targetIsValid) {
      setError('Enter a four-digit year between 2000 and 2099');
      return;
    }
    setIsWorking(true);
    setError(null);
    setPlan(null);
    try {
      const response = await api.post<{ plan: RolloverPlan }>(
        '/admin/tax-season/rollover/preview',
        { targetYear: parsedTarget }
      );
      setPlan(response.data.plan);
      setConfirmYear('');
    } catch (err) {
      setError(errorMessage(err, 'Failed to build the rollover preview'));
    } finally {
      setIsWorking(false);
    }
  };

  const handleStart = async () => {
    if (!plan) return;
    setIsWorking(true);
    setError(null);
    try {
      await api.post('/admin/tax-season/rollover', {
        targetYear: plan.targetYear,
        confirmYear: Number(confirmYear.trim())
      });
      // Seed a running state so polling begins without waiting for a refetch.
      setRun({
        status: 'running',
        targetYear: plan.targetYear,
        total: plan.items.length,
        created: 0,
        failed: 0,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        startedBy: 'admin',
        error: null,
        items: []
      });
    } catch (err) {
      setError(errorMessage(err, 'Failed to start the rollover'));
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-center space-x-3 mb-1">
        <Play className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-gray-900">Start a new season</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Creates one project per client for the target year, carrying forward their categories and
        document names with every status reset. Clients who already have a project for that year
        are skipped, so this is safe to run twice. Finishing a run also sets the current season.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {run && run.status !== 'idle' && <RunProgress run={run} />}

      {!isRunning && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="sm:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Target tax year</label>
              <input
                type="text"
                inputMode="numeric"
                value={targetYear}
                onChange={(e) => { setTargetYear(e.target.value); setPlan(null); }}
                className="input"
              />
            </div>
            <button
              onClick={handlePreview}
              disabled={isWorking}
              className="btn-outline flex items-center space-x-2"
            >
              {isWorking && !plan ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ListChecks className="h-4 w-4" />
              )}
              <span>Preview rollover</span>
            </button>
          </div>

          {plan && <PlanReview
            plan={plan}
            confirmYear={confirmYear}
            onConfirmYearChange={setConfirmYear}
            onStart={handleStart}
            isWorking={isWorking}
          />}
        </>
      )}
    </div>
  );
}

function PlanReview({
  plan,
  confirmYear,
  onConfirmYearChange,
  onStart,
  isWorking
}: {
  plan: RolloverPlan;
  confirmYear: string;
  onConfirmYearChange: (value: string) => void;
  onStart: () => void;
  isWorking: boolean;
}) {
  const confirmed = Number(confirmYear.trim()) === plan.targetYear;

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <div className="flex flex-wrap gap-3 text-sm mb-4">
        <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">
          {plan.items.length} to create
        </span>
        <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
          {plan.skipped.length} skipped
        </span>
        <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
          {plan.clients} clients scanned
        </span>
      </div>

      {plan.items.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
          Nothing to create — every client already has a {plan.targetYear} project.
        </div>
      ) : (
        <>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    New project
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Copied from
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categories
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Docs
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {plan.items.map(item => (
                  <tr key={item.sourceProjectId}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{item.newName}</div>
                      <div className="text-xs text-gray-500">{item.email}</div>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">
                      {item.sourceName}
                      {item.sourceYear !== null && (
                        <span className="ml-2 text-xs text-gray-400">({item.sourceYear})</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-900">{item.activeCategories}</td>
                    <td className="px-4 py-2.5 text-right text-gray-900">{item.documents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {plan.skipped.length > 0 && (
            <details className="mt-3">
              <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                {plan.skipped.length} client{plan.skipped.length === 1 ? '' : 's'} skipped
              </summary>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                {plan.skipped.map(skip => (
                  <div key={skip.email} className="px-4 py-2 text-sm flex items-center justify-between">
                    <span className="text-gray-700 truncate">{skip.email}</span>
                    <span className="ml-3 shrink-0 text-xs text-gray-500">{skip.detail}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="mt-5 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start space-x-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                This creates {plan.items.length} new record{plan.items.length === 1 ? '' : 's'} in
                HubSpot. If all of them succeed, the portal's current season moves to{' '}
                {plan.targetYear}. Type the year to confirm.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="numeric"
                value={confirmYear}
                onChange={(e) => onConfirmYearChange(e.target.value)}
                placeholder={String(plan.targetYear)}
                className="input sm:w-40"
              />
              <button
                onClick={onStart}
                disabled={!confirmed || isWorking}
                className="btn-primary flex items-center space-x-2 whitespace-nowrap"
              >
                {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span>Create {plan.items.length} project{plan.items.length === 1 ? '' : 's'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RunProgress({ run }: { run: RolloverRun }) {
  const done = run.created + run.failed;
  const percent = run.total > 0 ? Math.round((done / run.total) * 100) : 0;
  const failures = run.items.filter(item => item.outcome === 'failed');

  return (
    <div className="mb-6 rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {run.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          {run.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
          {run.status === 'failed' && <XCircle className="h-4 w-4 text-red-600" />}
          <span className="font-medium text-gray-900">
            {run.status === 'running' && `Rolling over to ${run.targetYear}…`}
            {run.status === 'completed' && `Rollover to ${run.targetYear} complete`}
            {run.status === 'failed' && `Rollover to ${run.targetYear} failed`}
          </span>
        </div>
        <span className="text-sm text-gray-500">
          {done} of {run.total}
        </span>
      </div>

      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={clsx(
            'h-full transition-all',
            run.status === 'failed' ? 'bg-red-500' : 'bg-primary'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-sm">
        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
          {run.created} created
        </span>
        {run.failed > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
            {run.failed} failed
          </span>
        )}
      </div>

      {run.error && (
        <p className="mt-3 text-sm text-red-700">{run.error}</p>
      )}

      {failures.length > 0 && (
        <details className="mt-3">
          <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-900">
            Show {failures.length} failure{failures.length === 1 ? '' : 's'}
          </summary>
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
            {failures.map(item => (
              <div key={item.sourceProjectId} className="px-4 py-2 text-sm">
                <div className="text-gray-900">{item.newName}</div>
                <div className="text-xs text-red-600">{item.error}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      {run.status === 'completed' && run.failed > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          The current season was left unchanged so the affected clients keep access to their
          existing project. Re-run the rollover — it retries only the clients that failed, and
          advances the season once none are left.
        </div>
      )}
    </div>
  );
}
