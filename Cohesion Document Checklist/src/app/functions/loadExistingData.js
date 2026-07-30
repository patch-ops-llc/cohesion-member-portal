const hubspot = require('@hubspot/api-client');

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

exports.main = async (context = {}) => {
  try {
    console.log('loadExistingData called with context:', JSON.stringify(context, null, 2));

    const { objectId, properties } = context.event?.payload || {};

    console.log('Extracted params:', { objectId, properties });

    if (!objectId || !Array.isArray(properties)) {
      console.error('Missing required parameters:', { objectId, properties });
      return {
        status: 'ERROR',
        message: 'Missing required parameters: objectId, properties (array)'
      };
    }

    const hubspotClient = new hubspot.Client({
      accessToken: process.env.PRIVATE_APP_ACCESS_TOKEN
    });

    // Always include document_data + accepted date for sync
    const propsToFetch = Array.from(
      new Set([...properties, 'document_data', DOCUMENTS_ACCEPTED_DATE_PROP, 'hs_lastmodifieddate'])
    );

    const result = await hubspotClient.crm.objects.basicApi.getById(
      'p_client_projects',
      objectId,
      propsToFetch
    );

    const props = result.properties || {};
    let documentData = {};
    try {
      documentData = JSON.parse(props.document_data || '{}');
    } catch (parseError) {
      console.warn('Could not parse document_data on load:', parseError.message);
    }

    let allAccepted = false;
    let documentsAcceptedDate = props[DOCUMENTS_ACCEPTED_DATE_PROP] || null;

    // Date sync must never block checklist load
    try {
      const existingDate = props[DOCUMENTS_ACCEPTED_DATE_PROP] || null;
      const editDate = props.hs_lastmodifieddate
        ? toHubSpotDateCentral(new Date(props.hs_lastmodifieddate))
        : toHubSpotDateCentral();

      const sync = buildDocumentsAcceptedDateProperties(documentData, existingDate, editDate);
      allAccepted = sync.allAccepted;
      documentsAcceptedDate = sync.documentsAcceptedDate;

      if (Object.keys(sync.properties).length > 0) {
        console.log('Syncing documents_accepted_date on card load', {
          objectId,
          allAccepted: sync.allAccepted,
          properties: sync.properties
        });
        await hubspotClient.crm.objects.basicApi.update(
          'p_client_projects',
          objectId,
          { properties: sync.properties }
        );
        props[DOCUMENTS_ACCEPTED_DATE_PROP] = sync.documentsAcceptedDate || '';
      }
    } catch (syncError) {
      console.warn('Documents Accepted Date sync failed on load; returning document_data anyway', syncError);
    }

    return {
      status: 'SUCCESS',
      data: {
        properties: props,
        allAccepted,
        documentsAcceptedDate
      }
    };
  } catch (error) {
    console.error('Error loading existing data:', error);

    return {
      status: 'ERROR',
      message: `Failed to load existing data: ${error.message}`
    };
  }
};
