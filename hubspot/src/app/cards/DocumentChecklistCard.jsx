import React, { useState, useEffect, useCallback } from 'react';
import {
  Text,
  Flex,
  Box,
  Input,
  Button,
  Divider,
  Alert,
  LoadingSpinner,
  Select,
  Checkbox,
  Accordion,
  ToggleGroup,
  ProgressBar,
  hubspot
} from '@hubspot/ui-extensions';
import { BACKEND_URL } from '../config';

hubspot.extend(({ context }) => (
  <DocumentChecklistCard context={context} />
));

const personalCategories = [
  { key: 'w_2s', label: 'W-2s' },
  { key: '1099s', label: '1099s' },
  { key: 'k_1s', label: 'K-1s' },
  { key: 'property_expenses', label: 'Property Expenses' },
  { key: '1098s', label: '1098s' },
  { key: 'charitable_donations', label: 'Charitable Donations' },
  { key: 'additional_documents', label: 'Additional Documents' },
  { key: 'livestock_sales_and_expenses', label: 'Livestock Sales and Expenses' },
  { key: 'foreign_bank_accounts', label: 'Foreign Bank Accounts' },
  { key: 'previous_personal_tax_returns', label: 'Previous Personal Tax Returns' }
];

const entityCategories = [
  { key: 'entity_income', label: 'Entity Income' },
  { key: 'entity_expenses', label: 'Entity Expenses' },
  { key: 'balance_sheet', label: 'Balance Sheet' },
  { key: 'p_l', label: 'P&L' },
  { key: 'trial_balance', label: 'Trial Balance' },
  { key: 'general_ledger', label: 'General Ledger' },
  { key: 'additions_and_disposals', label: 'Additions and Disposals' },
  { key: 'business_operation_agreement', label: 'Business Operation Agreement' },
  { key: 'previous_entity_tax_returns', label: 'Previous Entity Tax Returns' }
];

const allCategories = [...personalCategories, ...entityCategories];

const statusOptions = [
  { value: 'not_submitted', label: 'Not Submitted' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'needs_resubmission', label: 'Needs Resubmission' },
  { value: 'missing_files', label: 'Missing Files' },
  { value: 'accepted', label: 'Accepted' }
];

function DocumentChecklistCard({ context }) {
  const recordId = context?.crm?.objectId ?? context?.crm?.recordId;

  const [selectedSections, setSelectedSections] = useState('personal');
  const [selectedCategories, setSelectedCategories] = useState({});
  const [documentInputs, setDocumentInputs] = useState({});
  const [documentStatuses, setDocumentStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [autoSaveTrigger, setAutoSaveTrigger] = useState(0);

  const [modifiedFields, setModifiedFields] = useState({
    sections: false,
    categories: {},
    documents: {},
    statuses: {}
  });
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const loadData = useCallback(async () => {
    if (!recordId) {
      setError('No record context');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await hubspot.fetch(`${BACKEND_URL}/api/cards/projects/${recordId}`);
      const data = await res.json();
      const documentData = data.documentData || data;

      if (!documentData || typeof documentData !== 'object') {
        setDocumentInputs({});
        setDocumentStatuses({});
        setSelectedCategories({});
        setSelectedSections('personal');
        setLoading(false);
        return;
      }

      const newSelectedCategories = {};
      const newDocumentInputs = {};
      const newDocumentStatuses = {};

      if (documentData._meta?.selectedSections) {
        const sections = documentData._meta.selectedSections;
        setSelectedSections(Array.isArray(sections) ? (sections[0] || 'personal') : sections);
      }

      allCategories.forEach((category) => {
        const categoryData = documentData[category.key];

        if (categoryData?.status === 'active' && categoryData.documents?.length > 0) {
          newSelectedCategories[category.key] = true;
          newDocumentInputs[category.key] = categoryData.documents.map((doc, i) => ({
            id: `${category.key}_${i}`,
            value: doc.name || ''
          }));
          newDocumentStatuses[category.key] = categoryData.documents.map((doc, i) => ({
            id: `${category.key}_${i}`,
            value: doc.status || 'not_submitted'
          }));
        } else if (categoryData?.status === 'active') {
          newSelectedCategories[category.key] = true;
          newDocumentInputs[category.key] = [{ id: `${category.key}_0`, value: '' }];
          newDocumentStatuses[category.key] = [{ id: `${category.key}_0`, value: 'not_submitted' }];
        } else {
          newSelectedCategories[category.key] = false;
          newDocumentInputs[category.key] = [];
          newDocumentStatuses[category.key] = [];
        }
      });

      setSelectedCategories(newSelectedCategories);
      setDocumentInputs(newDocumentInputs);
      setDocumentStatuses(newDocumentStatuses);
      setHasLoadedOnce(true);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveData = useCallback(async () => {
    if (!recordId || Object.keys(modifiedFields.categories).length === 0 &&
        !modifiedFields.sections &&
        Object.keys(modifiedFields.documents).length === 0 &&
        Object.keys(modifiedFields.statuses).length === 0) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const documentData = {
        _meta: { selectedSections: [selectedSections] }
      };

      allCategories.forEach((category) => {
        const isActive = selectedCategories[category.key] || false;
        const inputs = documentInputs[category.key] || [];
        const statuses = documentStatuses[category.key] || [];

        const documents = inputs.map((input, i) => ({
          name: input.value,
          status: statuses[i]?.value || 'not_submitted'
        })).filter((d) => d.name.trim() !== '');

        documentData[category.key] = {
          label: category.label,
          status: isActive ? 'active' : 'inactive',
          documents
        };
      });

      const res = await hubspot.fetch(`${BACKEND_URL}/api/cards/projects/${recordId}`, {
        method: 'PATCH',
        body: { documentData, modifiedFields }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Save failed: ${res.status}`);
      }

      const result = await res.json();
      if (result.documentData) {
        setModifiedFields({
          sections: false,
          categories: {},
          documents: {},
          statuses: {}
        });
      }

      setSuccess('Saved');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [
    recordId,
    selectedSections,
    selectedCategories,
    documentInputs,
    documentStatuses,
    modifiedFields
  ]);

  useEffect(() => {
    if (autoSaveTrigger > 0 && !loading) {
      const timer = setTimeout(saveData, 800);
      return () => clearTimeout(timer);
    }
  }, [autoSaveTrigger, loading, saveData]);

  const handleSectionChange = (value) => {
    setSelectedSections(value);
    setModifiedFields((prev) => ({ ...prev, sections: true }));
    setAutoSaveTrigger((prev) => prev + 1);
  };

  const handleCategoryToggle = (categoryKey, checked) => {
    const newSelected = { ...selectedCategories, [categoryKey]: checked };
    setSelectedCategories(newSelected);

    const newInputs = { ...documentInputs };
    const newStatuses = { ...documentStatuses };

    if (checked) {
      newInputs[categoryKey] = [{ id: `${categoryKey}_0`, value: '' }];
      newStatuses[categoryKey] = [{ id: `${categoryKey}_0`, value: 'not_submitted' }];
    } else {
      newInputs[categoryKey] = [];
      newStatuses[categoryKey] = [];
    }

    setDocumentInputs(newInputs);
    setDocumentStatuses(newStatuses);
    setModifiedFields((prev) => ({
      ...prev,
      categories: { ...prev.categories, [categoryKey]: true }
    }));
    setAutoSaveTrigger((prev) => prev + 1);
  };

  const addDocument = (categoryKey) => {
    const inputs = documentInputs[categoryKey] || [];
    const statuses = documentStatuses[categoryKey] || [];
    const newId = `${categoryKey}_${Date.now()}`;

    setDocumentInputs((prev) => ({
      ...prev,
      [categoryKey]: [...inputs, { id: newId, value: '' }]
    }));
    setDocumentStatuses((prev) => ({
      ...prev,
      [categoryKey]: [...statuses, { id: newId, value: 'not_submitted' }]
    }));
    setModifiedFields((prev) => ({
      ...prev,
      categories: { ...prev.categories, [categoryKey]: true }
    }));
    setAutoSaveTrigger((prev) => prev + 1);
  };

  const removeDocument = (categoryKey, inputId) => {
    const inputs = (documentInputs[categoryKey] || []).filter((i) => i.id !== inputId);
    const statuses = (documentStatuses[categoryKey] || []).filter((s) => s.id !== inputId);

    setDocumentInputs((prev) => ({ ...prev, [categoryKey]: inputs }));
    setDocumentStatuses((prev) => ({ ...prev, [categoryKey]: statuses }));
    setModifiedFields((prev) => ({
      ...prev,
      categories: { ...prev.categories, [categoryKey]: true }
    }));
    setAutoSaveTrigger((prev) => prev + 1);
  };

  const handleDocumentChange = (categoryKey, inputId, value) => {
    setDocumentInputs((prev) => ({
      ...prev,
      [categoryKey]: (prev[categoryKey] || []).map((i) =>
        i.id === inputId ? { ...i, value } : i
      )
    }));
    const idx = (documentInputs[categoryKey] || []).findIndex((i) => i.id === inputId);
    setModifiedFields((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        [categoryKey]: { ...(prev.documents[categoryKey] || {}), [idx]: true }
      }
    }));
    setAutoSaveTrigger((prev) => prev + 1);
  };

  const handleStatusChange = (categoryKey, inputId, value) => {
    setDocumentStatuses((prev) => ({
      ...prev,
      [categoryKey]: (prev[categoryKey] || []).map((s) =>
        s.id === inputId ? { ...s, value } : s
      )
    }));
    const idx = (documentStatuses[categoryKey] || []).findIndex((s) => s.id === inputId);
    setModifiedFields((prev) => ({
      ...prev,
      statuses: {
        ...prev.statuses,
        [categoryKey]: { ...(prev.statuses[categoryKey] || {}), [idx]: true }
      }
    }));
    setAutoSaveTrigger((prev) => prev + 1);
  };

  const handleDocumentBlur = () => {
    setAutoSaveTrigger((prev) => prev + 1);
  };

  const sectionOptions = [
    { value: 'personal', label: 'Personal', description: 'Personal tax return documents' },
    { value: 'entity', label: 'Entity', description: 'Entity tax return documents' }
  ];

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
                const statusForInput = (documentStatuses[category.key] || []).find(
                  (s) => s.id === input.id
                );
                return (
                  <Flex key={input.id} gap="small" align="center">
                    <Box style={{ flex: '3' }}>
                      <Input
                        name={`${category.key}_${input.id}`}
                        placeholder={`Enter ${category.label.toLowerCase()} document name`}
                        value={input.value}
                        onChange={(value) => handleDocumentChange(category.key, input.id, value)}
                        onBlur={handleDocumentBlur}
                      />
                    </Box>
                    <Box style={{ flex: '1', minWidth: '120px' }}>
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
                      onClick={() => removeDocument(category.key, input.id)}
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
                  onClick={() => addDocument(category.key)}
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
      <Flex direction="column" gap="medium" align="center">
        <LoadingSpinner />
        <Text>Loading document checklist...</Text>
      </Flex>
    );
  }

  if (error && !hasLoadedOnce) {
    return (
      <Flex direction="column" gap="medium">
        <Alert title="Error" variant="error">
          {error}
        </Alert>
        <Text variant="microcopy">
          Ensure the portal is deployed and BACKEND_URL matches your deployment.
        </Text>
      </Flex>
    );
  }

  const categoriesToShow = selectedSections === 'personal' ? personalCategories : entityCategories;

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

      <Divider distance="medium" />

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

      <Accordion
        title={selectedSections === 'personal' ? 'Personal Tax Return' : 'Entity Tax Return'}
        defaultOpen={true}
      >
        <Flex direction="column" gap="medium">
          {categoriesToShow.map((category, index) => (
            <React.Fragment key={category.key}>
              {renderCategorySection(category)}
              {index < categoriesToShow.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </Flex>
      </Accordion>

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

      <Flex justify="end" gap="small" style={{ marginTop: '16px' }}>
        <Button
          variant="primary"
          size="small"
          onClick={() => {
            const categoriesToSave = (selectedSections === 'personal' ? personalCategories : entityCategories).reduce(
              (acc, c) => ({ ...acc, [c.key]: true }),
              {}
            );
            setModifiedFields({
              sections: true,
              categories: categoriesToSave,
              documents: {},
              statuses: {}
            });
            setAutoSaveTrigger((prev) => prev + 1);
          }}
          disabled={saving}
        >
          Save
        </Button>
        <Button variant="secondary" size="small" onClick={loadData} disabled={loading}>
          Refresh
        </Button>
        <Button
          variant="destructive"
          size="small"
          onClick={async () => {
            if (!recordId) return;
            setSaving(true);
            try {
              const clearedData = { _meta: { selectedSections: ['personal'] } };
              const clearedCategories = {};
              allCategories.forEach((c) => {
                clearedData[c.key] = { label: c.label, status: 'inactive', documents: [] };
                clearedCategories[c.key] = true;
              });
              const res = await hubspot.fetch(`${BACKEND_URL}/api/cards/projects/${recordId}`, {
                method: 'PATCH',
                body: {
                  documentData: clearedData,
                  modifiedFields: {
                    sections: true,
                    categories: clearedCategories,
                    documents: {},
                    statuses: {}
                  }
                }
              });
              if (res.ok) {
                const catState = {};
                allCategories.forEach((c) => { catState[c.key] = false; });
                setSelectedCategories(catState);
                setDocumentInputs({});
                setDocumentStatuses({});
                setSuccess('Cleared');
                setTimeout(() => setSuccess(''), 2000);
              }
            } catch (e) {
              setError(e.message);
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          Clear All Data (Testing)
        </Button>
      </Flex>
    </Box>
  );
}
