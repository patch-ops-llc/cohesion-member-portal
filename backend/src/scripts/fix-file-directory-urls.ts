/**
 * One-off maintenance script: repair malformed `file_directory` URLs on every
 * project record in HubSpot.
 *
 * Background: an earlier version of the backend stored folder links as
 *   https://app.hubspot.com/files/<folderId>
 * but HubSpot's File Manager needs the canonical form
 *   https://app-na2.hubspot.com/files/<portalId>/?folderId=<folderId>
 * This script scans all p_client_projects records, normalizes any malformed
 * value, and writes the corrected URL back.
 *
 * Usage (from backend/):
 *   npm run fix:file-directories            # apply fixes
 *   npm run fix:file-directories -- --dry-run   # report only, no writes
 *
 * Requires HUBSPOT_ACCESS_TOKEN (and optionally HUBSPOT_PORTAL_ID /
 * HUBSPOT_CUSTOM_OBJECT_TYPE) to be set in the environment.
 */
import { Client } from '@hubspot/api-client';
import { buildFolderUrl, extractFolderId } from '../services/hubspot';

const CUSTOM_OBJECT_TYPE = process.env.HUBSPOT_CUSTOM_OBJECT_TYPE || '2-171216725';
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.error('HUBSPOT_ACCESS_TOKEN is not set. Aborting.');
    process.exit(1);
  }

  const client = new Client({ accessToken: token });

  let after: string | undefined;
  let scanned = 0;
  let fixed = 0;
  let alreadyOk = 0;
  let noFolder = 0;
  const failures: Array<{ id: string; error: string }> = [];

  console.log(`Starting file_directory cleanup${DRY_RUN ? ' (DRY RUN — no writes)' : ''}...`);

  do {
    const response = await client.crm.objects.basicApi.getPage(
      CUSTOM_OBJECT_TYPE,
      100,
      after,
      ['client_project_name', 'email', 'file_directory']
    );

    for (const record of response.results) {
      scanned++;
      const current = (record.properties as Record<string, string | null>).file_directory;
      const folderId = extractFolderId(current);

      if (!folderId) {
        // No folder URL at all, or unparseable — nothing to repair.
        if (current) {
          console.warn(`[skip] ${record.id} has an unparseable file_directory: ${current}`);
        }
        noFolder++;
        continue;
      }

      const canonical = buildFolderUrl(folderId);
      if (current === canonical) {
        alreadyOk++;
        continue;
      }

      console.log(`[fix] ${record.id} (${record.properties.client_project_name || record.properties.email || 'unknown'})`);
      console.log(`        from: ${current}`);
      console.log(`        to:   ${canonical}`);

      if (!DRY_RUN) {
        try {
          await client.crm.objects.basicApi.update(
            CUSTOM_OBJECT_TYPE,
            record.id,
            { properties: { file_directory: canonical } }
          );
          fixed++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push({ id: record.id, error: message });
          console.error(`[error] failed to update ${record.id}: ${message}`);
        }
      } else {
        fixed++;
      }
    }

    after = response.paging?.next?.after;
  } while (after);

  console.log('\n--- Summary ---');
  console.log(`Scanned:        ${scanned}`);
  console.log(`${DRY_RUN ? 'Would fix:      ' : 'Fixed:          '}${fixed}`);
  console.log(`Already correct: ${alreadyOk}`);
  console.log(`No folder set:   ${noFolder}`);
  if (failures.length) {
    console.log(`Failures:        ${failures.length}`);
    failures.forEach(f => console.log(`  - ${f.id}: ${f.error}`));
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error running cleanup:', error);
  process.exit(1);
});
