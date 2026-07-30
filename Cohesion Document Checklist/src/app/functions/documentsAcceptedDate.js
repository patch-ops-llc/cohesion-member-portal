/**
 * Shared helpers for Documents Accepted Date sync in HubSpot serverless functions.
 */

const DOCUMENTS_ACCEPTED_DATE_PROP = 'documents_accepted_date';

function getDocumentAcceptanceBlockers(documentData) {
  const blockers = [];
  let namedDocCount = 0;

  for (const key of Object.keys(documentData || {})) {
    if (key === '_meta') continue;
    const category = documentData[key];
    if (!category || category.status !== 'active') continue;

    const docs = (category.documents || []).filter((doc) => (doc.name || '').trim() !== '');
    if (docs.length === 0) continue;

    for (const doc of docs) {
      namedDocCount += 1;
      if (doc.status !== 'accepted') {
        blockers.push(`${key}: "${doc.name}" (${doc.status || 'unknown'})`);
      }
    }
  }

  if (namedDocCount === 0) {
    blockers.push('no_named_documents');
  }

  return blockers;
}

function toHubSpotDateCentral(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Returns properties to merge into a HubSpot update for documents_accepted_date.
 * - all accepted + empty existing → set dateValue (default today Central)
 * - not all accepted → clear
 * - all accepted + existing → leave unset (preserve)
 */
function buildDocumentsAcceptedDateProperties(documentData, existingDate, dateValue) {
  const allAccepted = getDocumentAcceptanceBlockers(documentData).length === 0;
  const properties = {};

  if (allAccepted) {
    if (!existingDate) {
      properties[DOCUMENTS_ACCEPTED_DATE_PROP] = dateValue || toHubSpotDateCentral();
    }
  } else if (existingDate) {
    properties[DOCUMENTS_ACCEPTED_DATE_PROP] = '';
  }

  return {
    allAccepted,
    properties,
    documentsAcceptedDate: allAccepted
      ? (existingDate || properties[DOCUMENTS_ACCEPTED_DATE_PROP] || null)
      : null
  };
}

module.exports = {
  DOCUMENTS_ACCEPTED_DATE_PROP,
  getDocumentAcceptanceBlockers,
  toHubSpotDateCentral,
  buildDocumentsAcceptedDateProperties
};
