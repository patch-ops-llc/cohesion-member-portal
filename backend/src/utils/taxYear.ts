/**
 * Tax year resolution for p_client_projects.
 *
 * Projects predate the `tax_year` property, so their only record of a season is
 * the year written into `client_project_name` ("John Smith 2025 Tax Return").
 * Everything here treats the explicit property as authoritative and falls back
 * to the name so legacy records still classify without a backfill.
 */

export const MIN_TAX_YEAR = 2000;
export const MAX_TAX_YEAR = 2099;

/** Matches a standalone 20xx token, so "1120S" and "W-2" don't read as years. */
const YEAR_TOKEN = /\b20\d{2}\b/g;

export function isValidTaxYear(year: unknown): year is number {
  return (
    typeof year === 'number' &&
    Number.isInteger(year) &&
    year >= MIN_TAX_YEAR &&
    year <= MAX_TAX_YEAR
  );
}

/** Coerce a HubSpot property value (always a string over the wire) to a year. */
export function parseTaxYear(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const year = typeof value === 'number' ? value : Number(String(value).trim());
  return isValidTaxYear(year) ? year : null;
}

/**
 * Highest 20xx token in the name. Ranges like "2024-2025" resolve to the later
 * year, which is the season staff are actually working.
 */
export function inferTaxYearFromName(name?: string | null): number | null {
  if (!name) return null;
  const matches = name.match(YEAR_TOKEN);
  if (!matches) return null;

  const years = matches.map(Number).filter(isValidTaxYear);
  return years.length ? Math.max(...years) : null;
}

export interface TaxYearSignals {
  taxYear?: string | number | null;
  name?: string | null;
}

/** The year a project belongs to, or null when neither source says. */
export function resolveTaxYear(signals: TaxYearSignals): number | null {
  return parseTaxYear(signals.taxYear) ?? inferTaxYearFromName(signals.name);
}

/** True when the property is missing but the name implies a year worth stamping. */
export function needsTaxYearBackfill(signals: TaxYearSignals): boolean {
  return parseTaxYear(signals.taxYear) === null && inferTaxYearFromName(signals.name) !== null;
}

/**
 * Rewrite a project name for a new season. Replaces the last 20xx token so
 * "John Smith 2025 Tax Return" becomes "John Smith 2026 Tax Return"; appends
 * the year when the name has none.
 */
export function renameForTaxYear(name: string | null | undefined, targetYear: number): string {
  const base = (name || '').trim();
  if (!base) return String(targetYear);

  const matches = [...base.matchAll(YEAR_TOKEN)].filter(m => isValidTaxYear(Number(m[0])));
  if (matches.length === 0) return `${base} ${targetYear}`;

  const last = matches[matches.length - 1];
  const start = last.index ?? 0;
  return base.slice(0, start) + targetYear + base.slice(start + last[0].length);
}

/**
 * Client portal visibility. Unknown-year projects stay visible: guessing wrong
 * would hide a client's live engagement, which is far worse than leaving one
 * stale card on the list.
 */
export function isVisibleForSeason(
  projectYear: number | null,
  currentTaxYear: number | null,
  hidePriorYearProjects: boolean
): boolean {
  if (!hidePriorYearProjects) return true;
  if (!isValidTaxYear(currentTaxYear)) return true;
  if (projectYear === null) return true;
  return projectYear >= currentTaxYear;
}
