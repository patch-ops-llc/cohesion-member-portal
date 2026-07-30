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
    console.log('saveDocuments called with context:', JSON.stringify(context, null, 2));

    const { objectId, allDataJson } = context.event?.payload || {};

    console.log('Extracted params:', { objectId, allDataJson });

    if (!objectId || !allDataJson) {
      console.error('Missing required parameters:', { objectId, allDataJson });
      return {
        status: 'ERROR',
        message: 'Missing required parameters: objectId, allDataJson'
      };
    }

    const hubspotClient = new hubspot.Client({
      accessToken: process.env.PRIVATE_APP_ACCESS_TOKEN
    });

    let documentData;
    try {
      documentData = typeof allDataJson === 'string' ? JSON.parse(allDataJson) : allDataJson;
    } catch (parseError) {
      return {
        status: 'ERROR',
        message: `Invalid allDataJson: ${parseError.message}`
      };
    }

    const properties = {
      document_data: typeof allDataJson === 'string' ? allDataJson : JSON.stringify(allDataJson)
    };

    let allAccepted = false;
    let documentsAcceptedDate = null;

    // Date sync must never block document_data save
    try {
      let existingDate = null;
      try {
        const current = await hubspotClient.crm.objects.basicApi.getById(
          'p_client_projects',
          objectId,
          [DOCUMENTS_ACCEPTED_DATE_PROP]
        );
        existingDate = current.properties?.[DOCUMENTS_ACCEPTED_DATE_PROP] || null;
      } catch (readError) {
        console.warn('Could not read documents_accepted_date:', readError.message);
      }

      const sync = buildDocumentsAcceptedDateProperties(
        documentData,
        existingDate,
        toHubSpotDateCentral()
      );
      allAccepted = sync.allAccepted;
      documentsAcceptedDate = sync.documentsAcceptedDate;
      Object.assign(properties, sync.properties);

      console.log('Saving document_data + accepted-date sync', {
        objectId,
        allAccepted: sync.allAccepted,
        documentsAcceptedDate: sync.documentsAcceptedDate,
        dateProps: sync.properties
      });
    } catch (syncError) {
      console.warn('Documents Accepted Date sync failed on save; saving document_data only', syncError);
    }

    try {
      await hubspotClient.crm.objects.basicApi.update(
        'p_client_projects',
        objectId,
        { properties }
      );
    } catch (updateError) {
      // If date property write fails, retry with document_data only
      if (DOCUMENTS_ACCEPTED_DATE_PROP in properties) {
        console.warn('Update with date failed; retrying document_data only', updateError.message);
        await hubspotClient.crm.objects.basicApi.update(
          'p_client_projects',
          objectId,
          {
            properties: {
              document_data: properties.document_data
            }
          }
        );
      } else {
        throw updateError;
      }
    }

    return {
      status: 'SUCCESS',
      data: {
        message: 'Documents saved successfully',
        allAccepted,
        documentsAcceptedDate
      }
    };
  } catch (error) {
    console.error('Error saving documents:', error);

    return {
      status: 'ERROR',
      message: `Failed to save documents: ${error.message}`
    };
  }
};
