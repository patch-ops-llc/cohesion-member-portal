const hubspot = require('@hubspot/api-client');
const {
  DOCUMENTS_ACCEPTED_DATE_PROP,
  toHubSpotDateCentral,
  buildDocumentsAcceptedDateProperties
} = require('./documentsAcceptedDate');

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

    // Read current date so we only stamp once / clear when incomplete
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

    const properties = {
      document_data: typeof allDataJson === 'string' ? allDataJson : JSON.stringify(allDataJson),
      ...sync.properties
    };

    console.log('Saving document_data + accepted-date sync', {
      objectId,
      allAccepted: sync.allAccepted,
      documentsAcceptedDate: sync.documentsAcceptedDate,
      dateProps: sync.properties
    });

    await hubspotClient.crm.objects.basicApi.update(
      'p_client_projects',
      objectId,
      { properties }
    );

    return {
      status: 'SUCCESS',
      data: {
        message: 'Documents saved successfully',
        allAccepted: sync.allAccepted,
        documentsAcceptedDate: sync.documentsAcceptedDate
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
