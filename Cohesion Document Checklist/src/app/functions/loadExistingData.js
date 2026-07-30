const hubspot = require('@hubspot/api-client');
const {
  DOCUMENTS_ACCEPTED_DATE_PROP,
  buildDocumentsAcceptedDateProperties,
  toHubSpotDateCentral
} = require('./documentsAcceptedDate');

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

    const existingDate = props[DOCUMENTS_ACCEPTED_DATE_PROP] || null;
    const editDate = props.hs_lastmodifieddate
      ? toHubSpotDateCentral(new Date(props.hs_lastmodifieddate))
      : toHubSpotDateCentral();

    const sync = buildDocumentsAcceptedDateProperties(documentData, existingDate, editDate);

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

    return {
      status: 'SUCCESS',
      data: {
        properties: props,
        allAccepted: sync.allAccepted,
        documentsAcceptedDate: sync.documentsAcceptedDate
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
