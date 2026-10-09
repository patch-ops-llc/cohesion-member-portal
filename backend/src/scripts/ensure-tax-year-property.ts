/**
 * Provision the `tax_year` property on p_client_projects, and optionally
 * backfill it from project names.
 *
 * The server also provisions the property on boot, so this script exists for
 * running the step ahead of a deploy and for driving the backfill from a
 * terminal instead of the admin UI.
 *
 * Usage (from backend/):
 *   tsx --env-file=.env src/scripts/ensure-tax-year-property.ts
 *   tsx --env-file=.env src/scripts/ensure-tax-year-property.ts --backfill --dry-run
 *   tsx --env-file=.env src/scripts/ensure-tax-year-property.ts --backfill
 *
 * Requires HUBSPOT_ACCESS_TOKEN (and DATABASE_URL when using --backfill, which
 * writes an audit log entry).
 */
import { ensureTaxYearProperty, TAX_YEAR_PROP } from '../services/hubspot';
import { backfillTaxYears, getSeasonOverview } from '../services/rollover';

const BACKFILL = process.argv.includes('--backfill');
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    console.error('HUBSPOT_ACCESS_TOKEN is not set. Aborting.');
    process.exit(1);
  }

  const { existed } = await ensureTaxYearProperty();
  console.log(
    existed
      ? `Property "${TAX_YEAR_PROP}" already exists on p_client_projects.`
      : `Created property "${TAX_YEAR_PROP}" on p_client_projects.`
  );

  const overview = await getSeasonOverview();
  console.log('\n--- Season overview ---');
  console.log(`Tax projects:        ${overview.taxProjects} (of ${overview.totalProjects} total)`);
  console.log(`Missing tax_year:    ${overview.missingTaxYear}`);
  console.log(`Backfillable:        ${overview.backfillable}`);
  for (const { year, count, fromNameOnly } of overview.years) {
    const label = year === null ? 'unknown' : String(year);
    console.log(`  ${label.padEnd(8)} ${String(count).padStart(5)}  (${fromNameOnly} from name only)`);
  }

  if (!BACKFILL) {
    console.log('\nRun with --backfill to stamp tax_year from project names.');
    return;
  }

  console.log(`\nBackfilling tax_year${DRY_RUN ? ' (DRY RUN — no writes)' : ''}...`);
  const result = await backfillTaxYears(DRY_RUN);

  for (const change of result.changes) {
    console.log(`  ${DRY_RUN ? '[would set]' : '[set]'} ${change.year}  ${change.name}`);
  }

  console.log('\n--- Backfill summary ---');
  console.log(`Scanned:      ${result.scanned}`);
  console.log(`${DRY_RUN ? 'Would update: ' : 'Updated:      '}${result.updated}`);
  console.log(`No year found: ${result.unresolved}`);

  if (result.failed) {
    console.log(`Failed:       ${result.failed}`);
    result.errors.forEach(e => console.log(`  - ${e.projectId}: ${e.error}`));
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
