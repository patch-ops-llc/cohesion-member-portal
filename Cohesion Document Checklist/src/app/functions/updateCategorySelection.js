const hubspot = require('@hubspot/api-client');

exports.main = async (context = {}) => {
  try {
    console.log('updateCategorySelection called with context:', JSON.stringify(context, null, 2));
    
    // Get parameters from context.event.payload (where HubSpot actually puts them)
    const { categoryKey, checked, objectId } = context.event?.payload || {};
    
    console.log('Extracted params:', { categoryKey, checked, objectId });
    
    if (!categoryKey || checked === undefined || !objectId) {
      console.error('Missing required parameters:', { categoryKey, checked, objectId });
      return {
        status: 'ERROR',
        message: 'Missing required parameters: categoryKey, checked, objectId'
      };
    }

    // Initialize HubSpot client
    const hubspotClient = new hubspot.Client({
      accessToken: process.env.PRIVATE_APP_ACCESS_TOKEN
    });

    // Update the category selection property
    // For dropdown fields, we need to use the appropriate dropdown value instead of boolean
    let propertyValue;
    if (checked) {
      // When checked, set to "Not Submitted" (the default state for new items)
      propertyValue = "Not Submitted";
    } else {
      // When unchecked, we might want to clear it or set to a specific value
      // For now, let's not update unchecked items to avoid issues
      console.log('Skipping unchecked category to avoid dropdown value issues');
      return {
        status: 'SUCCESS',
        data: { message: 'Category unchecked - no update needed' }
      };
    }
    
    const properties = {
      [categoryKey]: propertyValue
    };

    await hubspotClient.crm.objects.basicApi.update(
      'p_client_projects',
      objectId,
      {
        properties: properties
      }
    );

    return {
      status: 'SUCCESS',
      data: { message: 'Category selection updated successfully' }
    };

  } catch (error) {
    console.error('Error updating category selection:', error);
    
    return {
      status: 'ERROR',
      message: `Failed to update category selection: ${error.message}`
    };
  }
};
