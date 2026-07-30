import React, { useState, useEffect } from "react";
import {
  Text,
  Flex,
  Box,
  Input,
  Button,
  Divider,
  Alert,
  Heading,
  Select,
  Checkbox,
  Accordion,
  ToggleGroup,
  ProgressBar
} from "@hubspot/ui-extensions";
import { hubspot } from "@hubspot/ui-extensions";

hubspot.extend(({ context, runServerlessFunction, actions }) => (
  <Extension 
    context={context} 
    runServerlessFunction={runServerlessFunction}
    actions={actions}
  />
));

const Extension = ({ context, runServerlessFunction, actions }) => {
  // Document categories organized by type
  const personalCategories = [
    { key: 'w_2s', label: 'W-2s' },
    { key: '1099s', label: '1099s' },
    { key: 'schedule_c', label: 'Schedule C' },
    { key: 'schedule_e', label: 'Schedule E' },
    { key: 'property_expenses', label: 'Property Expenses' },
    { key: '1098s', label: '1098s' },
    { key: 'charitable_donations', label: 'Charitable Donations' },
    { key: 'livestock_sales_and_expenses', label: 'Livestock Sales and Expenses' },
    { key: 'foreign_bank_accounts', label: 'Foreign Bank Accounts' },
    { key: 'additional_documents', label: 'Additional Documents' },
    { key: 'previous_personal_tax_returns', label: 'Previous Personal Tax Returns' }
  ];

  const entityCategories = [
    { key: 'entity_income', label: 'Entity Income' },
    { key: 'entity_expenses', label: 'Entity Expenses' },
    { key: 'k_1s', label: 'K-1s' },
    { key: 'vehicle_mileage', label: 'Vehicle Mileage' },
    { key: 'balance_sheet', label: 'Balance Sheet' },
    { key: 'p_l', label: 'P&L' },
    { key: 'trial_balance', label: 'Trial Balance' },
    { key: 'general_ledger', label: 'General Ledger' },
    { key: 'additions_and_disposals', label: 'Additions and Disposals' },
    { key: 'business_operation_agreement', label: 'Business Operation Agreement' },
    { key: 'additional_documents', label: 'Additional Documents' },
    { key: 'previous_entity_tax_returns', label: 'Previous Entity Tax Returns' }
  ];

  // Combine all categories for data loading and clearing
  const documentCategories = [...personalCategories, ...entityCategories];

  // Status options for dropdowns
  const statusOptions = [
    { value: 'not_submitted', label: 'Not Submitted' },
    { value: 'pending_review', label: 'Pending Review' },
    { value: 'needs_resubmission', label: 'Needs Resubmission' },
    { value: 'missing_files', label: 'Missing Files' },
    { value: 'accepted', label: 'Accepted' }
  ];

  // State management
  const [selectedSections, setSelectedSections] = useState('personal'); // 'personal' or 'entity' (single select)
  const [selectedCategories, setSelectedCategories] = useState({});
  const [documentInputs, setDocumentInputs] = useState({});
  const [documentStatuses, setDocumentStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [autoSaveTrigger, setAutoSaveTrigger] = useState(0);
  const [documentsAcceptedDate, setDocumentsAcceptedDate] = useState('');
  
  // Track modifications made in this session for intelligent merging
  const [modifiedFields, setModifiedFields] = useState({
    sections: false, // Whether selectedSections was modified
    categories: {}, // Which categories were toggled (categoryKey: true)
    documents: {}, // Which documents were modified (categoryKey: { documentIndex: true })
    statuses: {} // Which statuses were changed (categoryKey: { documentIndex: true })
  });

  // Load existing data on component mount
  useEffect(() => {
    loadExistingData();
  }, [context.crm.objectId]);

  // Debounced auto-save - waits 800ms after last change before saving
  useEffect(() => {
    if (autoSaveTrigger > 0 && !loading) {
      const timer = setTimeout(() => {
        saveAllData();
      }, 800);
      
      return () => clearTimeout(timer);
    }
  }, [autoSaveTrigger, documentStatuses, documentInputs, selectedCategories, selectedSections, loading]);

  const loadExistingData = async () => {
    try {
      setLoading(true);
      setError('');
      
      const objectId = context.crm.objectId;
      
      // Get document_data property from HubSpot
      const result = await runServerlessFunction({
        name: 'function-loadExistingData',
        payload: {
          objectId,
          properties: ['document_data']
        }
      });

      console.log('loadExistingData result:', result);
      console.log('loadExistingData response status:', result.response?.status);
      console.log('loadExistingData response data:', result.response?.data);
      
      // Check if the serverless function itself failed
      if (result.response?.status === 'ERROR') {
        console.error('loadExistingData serverless function failed:', result);
        const errorMsg = result.response?.message || 'Failed to load data';
        throw new Error(errorMsg);
      }
      
      // Check if the response doesn't have the expected data
      if (result.status !== 'SUCCESS' || !result.response?.data) {
        console.error('loadExistingData failed:', result);
        const errorMsg = result.response?.message || result.message || 'Failed to load data';
        throw new Error(errorMsg);
      }

      const properties = result.response.data.properties;
      const documentDataJson = properties.document_data;
      const acceptedDate =
        result.response.data.documentsAcceptedDate ||
        properties.documents_accepted_date ||
        '';
      setDocumentsAcceptedDate(acceptedDate || '');
      
      const newSelectedCategories = {};
      const newDocumentInputs = {};
      const newDocumentStatuses = {};

      // Parse JSON data
      let allData = {};
      if (documentDataJson && typeof documentDataJson === 'string') {
        try {
          allData = JSON.parse(documentDataJson);
          console.log('Parsed document_data:', allData);
        } catch (parseError) {
          console.error('Error parsing document_data JSON:', parseError);
          allData = {};
        }
      }

      // Load selected sections if present
      if (allData._meta && allData._meta.selectedSections) {
        // Handle both legacy array format and new single value format
        if (Array.isArray(allData._meta.selectedSections)) {
          // Convert legacy array format to single value (take first item)
          setSelectedSections(allData._meta.selectedSections[0] || 'personal');
        } else {
          setSelectedSections(allData._meta.selectedSections);
        }
      }

      // Load data for each category from JSON
      documentCategories.forEach(category => {
        const categoryData = allData[category.key];
        
        if (categoryData && categoryData.status === 'active' && categoryData.documents) {
          // Category is active
          newSelectedCategories[category.key] = true;
          
          if (categoryData.documents.length > 0) {
            // Load existing documents
            newDocumentInputs[category.key] = categoryData.documents.map((doc, index) => ({
              id: `${category.key}_${index}`,
              value: doc.name || ''
            }));
            
            newDocumentStatuses[category.key] = categoryData.documents.map((doc, index) => ({
              id: `${category.key}_${index}`,
              value: doc.status || 'not_submitted'
            }));
          } else {
            // Active but no documents, add empty input
            newDocumentInputs[category.key] = [{
              id: `${category.key}_0`,
              value: ''
            }];
            newDocumentStatuses[category.key] = [{
              id: `${category.key}_0`,
              value: 'not_submitted'
            }];
          }
        } else {
          // Category is inactive or doesn't exist
          newSelectedCategories[category.key] = false;
          newDocumentInputs[category.key] = [];
          newDocumentStatuses[category.key] = [];
        }
      });

      setSelectedCategories(newSelectedCategories);
      setDocumentInputs(newDocumentInputs);
      setDocumentStatuses(newDocumentStatuses);
      
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load existing data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryToggle = async (categoryKey, checked) => {
    const newSelected = { ...selectedCategories, [categoryKey]: checked };
    setSelectedCategories(newSelected);

    // Add/remove document inputs and statuses
    const newInputs = { ...documentInputs };
    const newStatuses = { ...documentStatuses };
    
    if (checked) {
      // Add empty input when toggling ON
      newInputs[categoryKey] = [{
        id: `${categoryKey}_0`,
        value: ''
      }];
      newStatuses[categoryKey] = [{
        id: `${categoryKey}_0`,
        value: 'not_submitted'
      }];
    } else {
      // Clear inputs and statuses when unchecked
      newInputs[categoryKey] = [];
      newStatuses[categoryKey] = [];
    }
    
    setDocumentInputs(newInputs);
    setDocumentStatuses(newStatuses);
    
    // Mark this category as modified
    setModifiedFields(prev => ({
      ...prev,
      categories: { ...prev.categories, [categoryKey]: true }
    }));
    
    // Trigger debounced auto-save after toggle
    setAutoSaveTrigger(prev => prev + 1);
  };


  const addDocumentInput = (categoryKey) => {
    const currentInputs = documentInputs[categoryKey] || [];
    const currentStatuses = documentStatuses[categoryKey] || [];
    const newId = `${categoryKey}_${Date.now()}`;
    const newInputs = {
      ...documentInputs,
      [categoryKey]: [...currentInputs, { id: newId, value: '' }]
    };
    const newStatuses = {
      ...documentStatuses,
      [categoryKey]: [...currentStatuses, { id: newId, value: 'not_submitted' }]
    };
    setDocumentInputs(newInputs);
    setDocumentStatuses(newStatuses);
    
    // Mark this category as modified (we added a new document)
    setModifiedFields(prev => ({
      ...prev,
      categories: { ...prev.categories, [categoryKey]: true }
    }));
  };

  const removeDocumentInput = (categoryKey, inputId) => {
    const currentInputs = documentInputs[categoryKey] || [];
    const currentStatuses = documentStatuses[categoryKey] || [];
    const newInputs = {
      ...documentInputs,
      [categoryKey]: currentInputs.filter(input => input.id !== inputId)
    };
    const newStatuses = {
      ...documentStatuses,
      [categoryKey]: currentStatuses.filter(status => status.id !== inputId)
    };
    setDocumentInputs(newInputs);
    setDocumentStatuses(newStatuses);
    
    // Mark this category as modified (entire category since we removed a doc)
    setModifiedFields(prev => ({
      ...prev,
      categories: { ...prev.categories, [categoryKey]: true }
    }));
    
    // Trigger debounced auto-save after removal
    setAutoSaveTrigger(prev => prev + 1);
  };

  const handleDocumentInputChange = (categoryKey, inputId, value) => {
    const currentInputs = documentInputs[categoryKey] || [];
    const inputIndex = currentInputs.findIndex(input => input.id === inputId);
    const newInputs = {
      ...documentInputs,
      [categoryKey]: currentInputs.map(input => 
        input.id === inputId ? { ...input, value } : input
      )
    };
    setDocumentInputs(newInputs);
    
    // Mark this specific document as modified
    setModifiedFields(prev => ({
      ...prev,
      documents: {
        ...prev.documents,
        [categoryKey]: {
          ...(prev.documents[categoryKey] || {}),
          [inputIndex]: true
        }
      }
    }));
  };

  const handleStatusChange = (categoryKey, inputId, value) => {
    const currentStatuses = documentStatuses[categoryKey] || [];
    const statusIndex = currentStatuses.findIndex(status => status.id === inputId);
    const newStatuses = {
      ...documentStatuses,
      [categoryKey]: currentStatuses.map(status => 
        status.id === inputId ? { ...status, value } : status
      )
    };
    setDocumentStatuses(newStatuses);
    
    // Mark this specific status as modified
    setModifiedFields(prev => ({
      ...prev,
      statuses: {
        ...prev.statuses,
        [categoryKey]: {
          ...(prev.statuses[categoryKey] || {}),
          [statusIndex]: true
        }
      }
    }));
    
    // Trigger debounced auto-save
    setAutoSaveTrigger(prev => prev + 1);
  };

  const handleDocumentInputBlur = (categoryKey) => {
    // Trigger debounced auto-save when user finishes editing
    setAutoSaveTrigger(prev => prev + 1);
  };

  // Serialize all document data to JSON
  const serializeAllData = () => {
    const allData = {
      _meta: {
        // Store as array for backward compatibility with front-end
        selectedSections: [selectedSections]
      }
    };
    
    documentCategories.forEach(category => {
      const isActive = selectedCategories[category.key] || false;
      const inputs = documentInputs[category.key] || [];
      const statuses = documentStatuses[category.key] || [];
      
      // Build documents array with their statuses
      const documents = inputs.map((input, index) => ({
        name: input.value,
        status: statuses[index]?.value || 'not_submitted'
      })).filter(doc => doc.name.trim() !== '');
      
      allData[category.key] = {
        label: category.label,
        status: isActive ? 'active' : 'inactive',
        documents: documents
      };
    });
    
    return JSON.stringify(allData);
  };

  const saveAllData = async () => {
    try {
      setSaving(true);
      setError('');
      
      // First, fetch the latest data from HubSpot
      const result = await runServerlessFunction({
        name: 'function-loadExistingData',
        payload: {
          objectId: context.crm.objectId,
          properties: ['document_data']
        }
      });

      // Parse existing data from HubSpot
      let existingData = {};
      if (result.status === 'SUCCESS' && result.response?.data) {
        const documentDataJson = result.response.data.properties.document_data;
        if (documentDataJson && typeof documentDataJson === 'string') {
          try {
            existingData = JSON.parse(documentDataJson);
          } catch (parseError) {
            console.error('Error parsing existing document_data:', parseError);
            existingData = {};
          }
        }
      }

      // Build merged data - start with existing data
      const mergedData = { ...existingData };
      
      // Update _meta.selectedSections only if modified
      if (modifiedFields.sections) {
        if (!mergedData._meta) {
          mergedData._meta = {};
        }
        // Store as array for backward compatibility with front-end
        mergedData._meta.selectedSections = [selectedSections];
      }

      // Process each category
      documentCategories.forEach(category => {
        const categoryKey = category.key;
        const existingCategory = existingData[categoryKey] || {
          label: category.label,
          status: 'inactive',
          documents: []
        };
        
        // Check if this category was modified
        if (modifiedFields.categories[categoryKey]) {
          // Category was toggled or had documents added/removed
          const isActive = selectedCategories[categoryKey] || false;
          const inputs = documentInputs[categoryKey] || [];
          const statuses = documentStatuses[categoryKey] || [];
          
          // IMPORTANT: Merge with existing HubSpot data to preserve external updates (e.g., from member portal)
          const documents = inputs.map((input, index) => {
            const existingDoc = existingCategory.documents?.[index];
            
            // Check if this specific status was modified by the user in this session
            const statusModified = modifiedFields.statuses[categoryKey]?.[index];
            
            // Use local status only if explicitly modified, otherwise preserve HubSpot status
            let finalStatus;
            if (statusModified) {
              // User explicitly changed this status in the card
              finalStatus = statuses[index]?.value || 'not_submitted';
            } else if (existingDoc?.status) {
              // Preserve status from HubSpot (could have been set by member portal)
              finalStatus = existingDoc.status;
            } else {
              // Fall back to local state or default
              finalStatus = statuses[index]?.value || 'not_submitted';
            }
            
            return {
              name: input.value,
              status: finalStatus
            };
          }).filter(doc => doc.name.trim() !== '');
          
          mergedData[categoryKey] = {
            label: category.label,
            status: isActive ? 'active' : 'inactive',
            documents: documents
          };
        } else if (modifiedFields.documents[categoryKey] || modifiedFields.statuses[categoryKey]) {
          // Only specific documents or statuses were modified - merge them
          const inputs = documentInputs[categoryKey] || [];
          const statuses = documentStatuses[categoryKey] || [];
          
          // Build new documents array, merging with existing
          const documents = inputs.map((input, index) => {
            const existingDoc = existingCategory.documents?.[index];
            
            // Check if this specific document was modified
            const docModified = modifiedFields.documents[categoryKey]?.[index];
            const statusModified = modifiedFields.statuses[categoryKey]?.[index];
            
            return {
              name: docModified ? input.value : (existingDoc?.name || input.value),
              status: statusModified ? (statuses[index]?.value || 'not_submitted') : (existingDoc?.status || statuses[index]?.value || 'not_submitted')
            };
          }).filter(doc => doc.name && doc.name.trim() !== '');
          
          mergedData[categoryKey] = {
            label: category.label,
            status: existingCategory.status,
            documents: documents
          };
        }
        // If category wasn't modified at all, keep existing data (already in mergedData)
      });

      // Save merged data to HubSpot
      const saveResult = await runServerlessFunction({
        name: 'function-saveDocuments',
        payload: {
          objectId: context.crm.objectId,
          allDataJson: JSON.stringify(mergedData)
        }
      });

      console.log('saveAllData result:', saveResult);
      
      if (saveResult.status !== 'SUCCESS' || !saveResult.response?.data) {
        console.error('saveAllData failed:', saveResult);
        const errorMsg = saveResult.response?.message || saveResult.message || 'Failed to save documents';
        throw new Error(errorMsg);
      }

      // Clear modification tracking after successful save
      setModifiedFields({
        sections: false,
        categories: {},
        documents: {},
        statuses: {}
      });

      if (saveResult.response?.data?.documentsAcceptedDate !== undefined) {
        setDocumentsAcceptedDate(saveResult.response.data.documentsAcceptedDate || '');
      }

      setSuccess('Documents saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
      
    } catch (err) {
      console.error('Error saving documents:', err);
      setError('Failed to save documents. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const clearAllData = async () => {
    if (!confirm('Are you sure you want to clear all document data? This cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      setError('');
      
      // Clear all data by saving empty JSON
      await runServerlessFunction({
        name: 'function-saveDocuments',
        payload: {
          objectId: context.crm.objectId,
          allDataJson: JSON.stringify({})
        }
      });

      // Reset local state
      const clearedCategories = {};
      const clearedInputs = {};
      const clearedStatuses = {};
      
      documentCategories.forEach(category => {
        clearedCategories[category.key] = false;
        clearedInputs[category.key] = [];
        clearedStatuses[category.key] = [];
      });

      setSelectedCategories(clearedCategories);
      setDocumentInputs(clearedInputs);
      setDocumentStatuses(clearedStatuses);
      
      // Reset modification tracking
      setModifiedFields({
        sections: false,
        categories: {},
        documents: {},
        statuses: {}
      });
      
      setSuccess('All data cleared successfully!');
      setTimeout(() => setSuccess(''), 3000);
      
    } catch (err) {
      console.error('Error clearing data:', err);
      setError('Failed to clear data. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Section options for single select
  const sectionOptions = [
    { 
      value: 'personal', 
      label: 'Personal',
      initialIsChecked: selectedSections === 'personal',
      readonly: false,
      description: 'Personal tax return documents'
    },
    { 
      value: 'entity', 
      label: 'Entity',
      initialIsChecked: selectedSections === 'entity',
      readonly: false,
      description: 'Entity tax return documents'
    }
  ];

  const handleSectionChange = (value) => {
    setSelectedSections(value);
    
    // Mark sections as modified
    setModifiedFields(prev => ({
      ...prev,
      sections: true
    }));
    
    // Trigger debounced auto-save when sections change
    setAutoSaveTrigger(prev => prev + 1);
  };

  // Render a category section
  const renderCategorySection = (category) => (
    <Box key={category.key}>
      <Flex direction="column" gap="small">
        <Flex align="center" gap="small">
          <Checkbox
            name={category.key}
            checked={selectedCategories[category.key] || false}
            onChange={(checked) => handleCategoryToggle(category.key, checked)}
          />
          <Text>{category.label}</Text>
        </Flex>

        {selectedCategories[category.key] && (
          <Box style={{ marginLeft: '24px' }}>
            <Flex direction="column" gap="small">
              {(documentInputs[category.key] || []).map((input) => {
                const statusForInput = (documentStatuses[category.key] || []).find(status => status.id === input.id);
                return (
                  <Flex key={input.id} gap="small" align="center">
                    <Box style={{ flex: '3' }}>
                      <Input
                        name={`${category.key}_${input.id}`}
                        placeholder={`Enter ${category.label.toLowerCase()} document name`}
                        value={input.value}
                        onChange={(value) => handleDocumentInputChange(category.key, input.id, value)}
                        onBlur={() => handleDocumentInputBlur(category.key)}
                      />
                    </Box>
                    <Box style={{ flex: '1', minWidth: '150px' }}>
                      <Select
                        name={`${category.key}_status_${input.id}`}
                        options={statusOptions}
                        value={statusForInput?.value || 'not_submitted'}
                        onChange={(value) => handleStatusChange(category.key, input.id, value)}
                      />
                    </Box>
                    <Button
                      variant="destructive"
                      size="small"
                      onClick={() => removeDocumentInput(category.key, input.id)}
                    >
                      Remove
                    </Button>
                  </Flex>
                );
              })}
              <Box style={{ maxWidth: '200px' }}>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => addDocumentInput(category.key)}
                  disabled={saving}
                >
                  + Add Another Document
                </Button>
              </Box>
            </Flex>
          </Box>
        )}
      </Flex>
    </Box>
  );

  if (loading) {
    return (
      <Box>
        <ProgressBar
          title="Loading document checklist..."
          value={100}
          maxValue={100}
          showPercentage={false}
          variant="success"
        />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert title="Error" variant="error">
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert title="Success" variant="success">
          {success}
        </Alert>
      )}

      {documentsAcceptedDate ? (
        <Alert title="Documents Accepted Date" variant="success">
          {documentsAcceptedDate}
        </Alert>
      ) : (
        <Alert title="Documents Accepted Date" variant="info">
          Not set — fills automatically when every named document is Accepted
        </Alert>
      )}

      <Divider distance="medium" />
      
      {/* Section Selector - Single Select */}
      <Box style={{ marginBottom: '16px' }}>
        <ToggleGroup
          name="section_selector"
          label="Document Type"
          options={sectionOptions}
          value={selectedSections}
          onChange={handleSectionChange}
          toggleType="radioButtonList"
          variant="default"
          inline={true}
        />
      </Box>

      <Divider distance="medium" />
      
      {/* Personal Tax Return Section */}
      {selectedSections === 'personal' && (
        <Accordion title="Personal Tax Return" defaultOpen={true}>
          <Flex direction="column" gap="medium">
            {personalCategories.map((category, index) => (
              <React.Fragment key={category.key}>
                {renderCategorySection(category)}
                {index < personalCategories.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </Flex>
        </Accordion>
      )}

      {/* Entity Tax Return Section */}
      {selectedSections === 'entity' && (
        <>
          <Divider distance="medium" />
          <Accordion title="Entity Tax Return" defaultOpen={true}>
            <Flex direction="column" gap="medium">
              {entityCategories.map((category, index) => (
                <React.Fragment key={category.key}>
                  {renderCategorySection(category)}
                  {index < entityCategories.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </Flex>
          </Accordion>
        </>
      )}

      {saving && (
        <Box style={{ marginTop: '16px' }}>
          <ProgressBar
            title="Saving..."
            value={100}
            maxValue={100}
            showPercentage={false}
            variant="warning"
          />
        </Box>
      )}

      <Divider />
      
      <Flex justify="end" style={{ marginTop: '16px' }}>
        <Button
          variant="destructive"
          size="small"
          onClick={clearAllData}
          disabled={saving}
        >
          Clear All Data (Testing)
        </Button>
      </Flex>
    </Box>
  );
};
