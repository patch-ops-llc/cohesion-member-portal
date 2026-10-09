/**
 * Tax season rollover: create next season's project for every client who had
 * one last season, carrying the checklist shape forward but none of the work.
 *
 * Two things matter more than speed here. First, idempotency — a client who
 * already has a project for the target year is skipped, so a re-run after a
 * partial failure finishes the job instead of duplicating records. Second,
 * previewability — nothing writes to HubSpot until staff have seen the exact
 * list of records that would be created.
 */
import { logger } from '../utils/logger';
import prisma from '../db/client';
import * as hubspot from './hubspot';
import type { CategoryData, DocumentData, Project } from './hubspot';
import { renameForTaxYear } from '../utils/taxYear';
import { COLLECTING_DOCUMENTS_STAGE_ID } from '../utils/documentData';
import {
  claimRolloverRun,
  saveRolloverRun,
  setTaxSeasonSettings,
  type RolloverRun,
  type RolloverRunItem
} from './settings';

/** HubSpot allows 100 requests / 10s; a client costs ~4, so pace the loop. */
const DELAY_BETWEEN_CLIENTS_MS = 200;
const MAX_ATTEMPTS = 5;
/** Floor for rate-limit backoff: HubSpot's burst window is 10 seconds wide. */
const RATE_LIMIT_BACKOFF_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface HttpErrorShape {
  response?: { status?: number; headers?: Record<string, unknown> };
}

function backoffFor(error: unknown, attempt: number): number {
  const retryAfter = Number((error as HttpErrorShape)?.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  // Waiting less than the rate-limit window just burns attempts on 429s.
  return Math.min(RATE_LIMIT_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

/**
 * Retry with backoff that respects HubSpot's Retry-After.
 *
 * `retryOn5xx` must be false for non-idempotent calls. A 502 returned *after*
 * HubSpot committed a create would otherwise be retried into a duplicate
 * project that nothing knows about.
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  { retryOn5xx = true }: { retryOn5xx?: boolean } = {}
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = (error as HttpErrorShape)?.response?.status;
      const retryable =
        status === 429 || (retryOn5xx && typeof status === 'number' && status >= 500);
      if (!retryable || attempt === MAX_ATTEMPTS) break;

      const backoff = backoffFor(error, attempt);
      logger.warn('Rollover step failed, retrying', { label, attempt, status, backoff });
      await sleep(backoff);
    }
  }

  throw lastError;
}

/**
 * Next season's checklist: same sections, same categories, same document names,
 * every status reset. Unnamed placeholder rows are dropped — they carry no
 * information and clutter the client's list.
 */
export function buildFreshDocumentData(source: DocumentData): DocumentData {
  const fresh: DocumentData = {
    _meta: { selectedSections: [...(source._meta?.selectedSections || ['personal'])] }
  };

  for (const key of Object.keys(source)) {
    if (key === '_meta') continue;

    const category = source[key] as CategoryData;
    if (!category || typeof category !== 'object' || !('label' in category)) continue;

    const documents = (category.documents || [])
      .filter(doc => (doc?.name || '').trim() !== '')
      .map(doc => ({ name: doc.name, status: 'not_submitted' as const }));

    fresh[key] = {
      label: category.label,
      status: category.status === 'active' ? 'active' : 'inactive',
      documents
    };
  }

  return fresh;
}

function countDocuments(documentData: DocumentData): number {
  let count = 0;
  for (const key of Object.keys(documentData)) {
    if (key === '_meta') continue;
    const category = documentData[key] as CategoryData;
    if (category?.status === 'active') count += category.documents?.length || 0;
  }
  return count;
}

function countActiveCategories(documentData: DocumentData): number {
  let count = 0;
  for (const key of Object.keys(documentData)) {
    if (key === '_meta') continue;
    if ((documentData[key] as CategoryData)?.status === 'active') count += 1;
  }
  return count;
}

function createdAtMs(project: Project): number {
  const raw = project.properties.hs_createdate;
  const parsed = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export interface RolloverPlanItem {
  email: string;
  sourceProjectId: string;
  sourceName: string;
  sourceYear: number | null;
  newName: string;
  activeCategories: number;
  documents: number;
}

export interface RolloverSkip {
  email: string;
  projectName: string;
  reason: 'already_current' | 'no_tax_projects';
  detail: string;
}

export interface RolloverPlan {
  targetYear: number;
  scannedProjects: number;
  clients: number;
  items: RolloverPlanItem[];
  skipped: RolloverSkip[];
}

/**
 * Work out what a rollover to `targetYear` would create. Read-only.
 *
 * One project per client email: the latest prior season is the template. A
 * client whose latest project is already at or beyond the target year is
 * skipped, which is what makes re-running safe.
 */
export async function planRollover(targetYear: number): Promise<RolloverPlan> {
  const { projects } = await hubspot.getAllProjects();

  // Group *every* project, advisory included. The already-exists check has to
  // see records the advisory filter would drop, otherwise a project that
  // landed in an unmapped stage is invisible to the scan and the next run
  // creates a second one for that client.
  const byEmail = new Map<string, Project[]>();
  for (const project of projects) {
    const email = project.properties.email?.toLowerCase().trim();
    if (!email) continue;

    const list = byEmail.get(email) || [];
    list.push(project);
    byEmail.set(email, list);
  }

  const items: RolloverPlanItem[] = [];
  const skipped: RolloverSkip[] = [];

  for (const [email, clientProjects] of byEmail) {
    const existing = clientProjects.find(p => {
      const year = hubspot.getProjectTaxYear(p);
      return year !== null && year >= targetYear;
    });

    if (existing) {
      skipped.push({
        email,
        projectName: existing.properties.client_project_name || existing.id,
        reason: 'already_current',
        detail: `Already has a ${hubspot.getProjectTaxYear(existing)} project`
      });
      continue;
    }

    // Only a tax project can serve as a template — advisory work has no
    // document checklist to carry forward.
    const taxProjects = clientProjects.filter(p => !hubspot.projectIsAdvisory(p));
    if (taxProjects.length === 0) {
      skipped.push({
        email,
        projectName: clientProjects[0].properties.client_project_name || clientProjects[0].id,
        reason: 'no_tax_projects',
        detail: 'No tax-pipeline project to copy'
      });
      continue;
    }

    // Newest season wins; undated projects fall back to creation order.
    const source = [...taxProjects].sort((a, b) => {
      const yearDiff = (hubspot.getProjectTaxYear(b) ?? 0) - (hubspot.getProjectTaxYear(a) ?? 0);
      return yearDiff !== 0 ? yearDiff : createdAtMs(b) - createdAtMs(a);
    })[0];

    const sourceData = hubspot.parseDocumentData(source.properties.document_data);
    const fresh = buildFreshDocumentData(sourceData);

    items.push({
      email,
      sourceProjectId: source.id,
      sourceName: source.properties.client_project_name || source.id,
      sourceYear: hubspot.getProjectTaxYear(source),
      newName: renameForTaxYear(source.properties.client_project_name, targetYear),
      activeCategories: countActiveCategories(fresh),
      documents: countDocuments(fresh)
    });
  }

  items.sort((a, b) => a.newName.localeCompare(b.newName));

  logger.info('Planned tax season rollover', {
    targetYear,
    scannedProjects: projects.length,
    toCreate: items.length,
    skipped: skipped.length
  });

  return {
    targetYear,
    scannedProjects: projects.length,
    clients: byEmail.size,
    items,
    skipped
  };
}

/** Create one project and mirror the source's contact associations onto it. */
async function rollOverClient(item: RolloverPlanItem, targetYear: number): Promise<RolloverRunItem> {
  try {
    const source = await withRetry('getProject', () => hubspot.getProject(item.sourceProjectId));
    const fresh = buildFreshDocumentData(hubspot.parseDocumentData(source.properties.document_data));

    const created = await withRetry(
      'createProject',
      () =>
        hubspot.createProject({
          client_project_name: item.newName,
          email: item.email,
          cc_email: source.properties.cc_email || null,
          tax_year: targetYear,
          documentData: fresh,
          // A new season starts at the beginning, not wherever last year's
          // project ended up. An unmapped stage would also hide the project
          // from clients and from the next run's already-exists scan.
          pipeline: source.properties.hs_pipeline || null,
          pipelineStage: COLLECTING_DOCUMENTS_STAGE_ID
        }),
      { retryOn5xx: false }
    );

    // Association failures are logged and swallowed inside the HubSpot service:
    // a project that exists but is missing a link is recoverable by hand, while
    // aborting here would leave the record half-built. Client access keys off
    // the copied `email` property, so it survives either way.
    const contacts = await hubspot.getAssociatedContacts(item.sourceProjectId);
    for (const contact of contacts) {
      await hubspot.associateProjectWithContact(created.id, contact.id);
    }

    await prisma.auditLog.create({
      data: {
        action: 'tax_season_rollover_create',
        entityType: 'project',
        entityId: created.id,
        userType: 'admin',
        details: {
          targetYear,
          sourceProjectId: item.sourceProjectId,
          sourceName: item.sourceName,
          sourceYear: item.sourceYear,
          email: item.email,
          contactsLinked: contacts.length
        }
      }
    });

    return {
      email: item.email,
      sourceProjectId: item.sourceProjectId,
      sourceName: item.sourceName,
      newProjectId: created.id,
      newName: item.newName,
      outcome: 'created'
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Rollover failed for client', { email: item.email, error: message });

    return {
      email: item.email,
      sourceProjectId: item.sourceProjectId,
      sourceName: item.sourceName,
      newName: item.newName,
      outcome: 'failed',
      error: message
    };
  }
}

/**
 * Execute a rollover for the clients staff reviewed, re-checking the plan
 * first. Runs detached from the request that started it and reports progress
 * through the stored run state, because creating hundreds of HubSpot records
 * takes far longer than an HTTP request should live.
 */
export async function runRollover(reviewed: RolloverPlan, claimed: RolloverRun): Promise<void> {
  const { targetYear } = reviewed;
  let run = claimed;

  try {
    // Re-plan now that we hold the slot. The reviewed plan was built before
    // the claim, so another run (or a project created by hand) may already
    // have covered some of these clients; acting on the stale list would
    // duplicate them. Intersecting with the reviewed emails keeps the run
    // limited to what staff actually approved.
    const approved = new Set(reviewed.items.map(item => item.email));
    const fresh = await planRollover(targetYear);
    const items = fresh.items.filter(item => approved.has(item.email));

    if (items.length !== reviewed.items.length) {
      logger.info('Rollover plan changed since preview', {
        targetYear,
        reviewed: reviewed.items.length,
        toCreate: items.length
      });
    }

    run = { ...run, total: items.length };
    await saveRolloverRun(run);

    for (const item of items) {
      const result = await rollOverClient(item, targetYear);

      run = {
        ...run,
        created: run.created + (result.outcome === 'created' ? 1 : 0),
        failed: run.failed + (result.outcome === 'failed' ? 1 : 0),
        items: [...run.items, result]
      };
      await saveRolloverRun(run);

      await sleep(DELAY_BETWEEN_CLIENTS_MS);
    }

    // Advance the season only on a clean run. Every failed client is one whose
    // prior-season project would be hidden with no replacement to take its
    // place — they'd log in to an empty portal. Re-running is safe and skips
    // the clients that already succeeded, so leaving the season alone costs
    // nothing and keeps those clients whole in the meantime.
    if (run.failed === 0) {
      await setTaxSeasonSettings({ currentTaxYear: targetYear });
    } else {
      logger.warn('Rollover finished with failures; current season left unchanged', {
        targetYear,
        failed: run.failed
      });
    }

    run = { ...run, status: 'completed', finishedAt: new Date().toISOString() };
    await saveRolloverRun(run);

    await prisma.auditLog.create({
      data: {
        action: 'tax_season_rollover_complete',
        entityType: 'settings',
        entityId: 'taxSeason',
        userType: 'admin',
        details: { targetYear, total: run.total, created: run.created, failed: run.failed }
      }
    });

    logger.info('Tax season rollover complete', {
      targetYear,
      created: run.created,
      failed: run.failed
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await saveRolloverRun({
      ...run,
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: message
    });
    logger.error('Tax season rollover aborted', { targetYear, error: message });
  }
}

/**
 * Claim the rollover slot and start the run detached from the caller.
 * Returns null when another run already holds the slot.
 */
export async function startRollover(
  plan: RolloverPlan,
  startedBy: string
): Promise<RolloverRun | null> {
  const claimed = await claimRolloverRun(plan.targetYear, plan.items.length, startedBy);
  if (!claimed) return null;

  void runRollover(plan, claimed);
  return claimed;
}

// ─── Season overview & backfill ────────────────────────────────────────

export interface SeasonOverview {
  totalProjects: number;
  taxProjects: number;
  years: Array<{ year: number | null; count: number; fromNameOnly: number }>;
  missingTaxYear: number;
  backfillable: number;
}

/**
 * Project counts per season, and how many of those years are only known from
 * the project name. Tells staff whether the filter can be trusted yet.
 */
export async function getSeasonOverview(): Promise<SeasonOverview> {
  const { projects } = await hubspot.getAllProjects();

  const counts = new Map<number | null, { count: number; fromNameOnly: number }>();
  let taxProjects = 0;
  let missingTaxYear = 0;
  let backfillable = 0;

  for (const project of projects) {
    if (hubspot.projectIsAdvisory(project)) continue;
    taxProjects += 1;

    const hasExplicit = hubspot.hasExplicitTaxYear(project);
    const year = hubspot.getProjectTaxYear(project);

    if (!hasExplicit) {
      missingTaxYear += 1;
      if (year !== null) backfillable += 1;
    }

    const entry = counts.get(year) || { count: 0, fromNameOnly: 0 };
    entry.count += 1;
    if (!hasExplicit && year !== null) entry.fromNameOnly += 1;
    counts.set(year, entry);
  }

  const years = [...counts.entries()]
    .map(([year, stats]) => ({ year, ...stats }))
    .sort((a, b) => (b.year ?? -1) - (a.year ?? -1));

  return { totalProjects: projects.length, taxProjects, years, missingTaxYear, backfillable };
}

export interface BackfillResult {
  dryRun: boolean;
  scanned: number;
  updated: number;
  failed: number;
  unresolved: number;
  changes: Array<{ projectId: string; name: string; year: number }>;
  errors: Array<{ projectId: string; error: string }>;
}

/**
 * Stamp `tax_year` on tax projects that lack it, using the year in the project
 * name. Makes the portal filter depend on a real property instead of on string
 * parsing at read time.
 */
export async function backfillTaxYears(dryRun: boolean): Promise<BackfillResult> {
  const { projects } = await hubspot.getAllProjects();

  const result: BackfillResult = {
    dryRun,
    scanned: 0,
    updated: 0,
    failed: 0,
    unresolved: 0,
    changes: [],
    errors: []
  };

  for (const project of projects) {
    if (hubspot.projectIsAdvisory(project)) continue;
    result.scanned += 1;

    if (hubspot.hasExplicitTaxYear(project)) continue;

    const year = hubspot.getProjectTaxYear(project);
    if (year === null) {
      result.unresolved += 1;
      continue;
    }

    const name = project.properties.client_project_name || project.id;
    result.changes.push({ projectId: project.id, name, year });

    if (dryRun) {
      result.updated += 1;
      continue;
    }

    try {
      await withRetry('updateProjectTaxYear', () => hubspot.updateProjectTaxYear(project.id, year));
      result.updated += 1;
      await sleep(120);
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        projectId: project.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (!dryRun) {
    await prisma.auditLog.create({
      data: {
        action: 'tax_season_backfill',
        entityType: 'settings',
        entityId: 'taxSeason',
        userType: 'admin',
        details: { scanned: result.scanned, updated: result.updated, failed: result.failed }
      }
    });
  }

  logger.info('Tax year backfill finished', {
    dryRun,
    scanned: result.scanned,
    updated: result.updated,
    failed: result.failed,
    unresolved: result.unresolved
  });

  return result;
}
