const HUBSPOT_PORTAL_ID = '242796132';

// Build the canonical HubSpot File Manager URL for a folder.
// HubSpot expects: https://app-na2.hubspot.com/files/<portalId>/?folderId=<folderId>
export function buildFolderUrl(folderId: string | number): string {
  return `https://app-na2.hubspot.com/files/${HUBSPOT_PORTAL_ID}/?folderId=${folderId}`;
}

// Pull the folder id out of any stored file_directory value, handling both the
// correct format (…?folderId=<id>) and the legacy/malformed format
// (https://app.hubspot.com/files/<id>).
export function extractFolderId(fileDirectory?: string | null): string | null {
  if (!fileDirectory) return null;
  const withParam = fileDirectory.match(/folderId=(\d+)/);
  if (withParam) return withParam[1];
  const legacy = fileDirectory.match(/\/files\/(\d+)\/?$/);
  if (legacy) return legacy[1];
  return null;
}

// Normalize a possibly-malformed file_directory into the canonical URL so the
// link always points at the right place, even for older records that haven't
// been migrated yet. Falls back to the original value if no id can be found.
export function normalizeFolderUrl(fileDirectory?: string | null): string | undefined {
  if (!fileDirectory) return undefined;
  const folderId = extractFolderId(fileDirectory);
  return folderId ? buildFolderUrl(folderId) : fileDirectory;
}
