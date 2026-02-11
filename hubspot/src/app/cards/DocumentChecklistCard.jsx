import React, { useState, useEffect } from 'react';
import {
  Text,
  Flex,
  Tag,
  Divider,
  LoadingSpinner,
  hubspot
} from '@hubspot/ui-extensions';
import { BACKEND_URL } from '../config';

hubspot.extend(({ context }) => (
  <DocumentChecklistCard context={context} />
));

function DocumentChecklistCard({ context }) {
  const [documentData, setDocumentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const recordId = context?.crm?.recordId;

  useEffect(() => {
    if (!recordId) {
      setError('No record context');
      setLoading(false);
      return;
    }

    hubspot
      .fetch(`${BACKEND_URL}/api/cards/projects/${recordId}`)
      .then((res) => res.json())
      .then((data) => {
        setDocumentData(data.documentData || data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setDocumentData(null);
      })
      .finally(() => setLoading(false));
  }, [recordId]);

  if (loading) {
    return (
      <Flex direction="column" gap="medium" align="center">
        <LoadingSpinner />
        <Text>Loading document checklist...</Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <Flex direction="column" gap="medium">
        <Tag>Unable to load</Tag>
        <Text variant="microcopy">
          Could not reach the Cohesion Portal. Ensure the portal is deployed and
          BACKEND_URL in hubspot/src/app/config.js matches your deployment. Use the
          admin dashboard for full editing.
        </Text>
      </Flex>
    );
  }

  if (!documentData || typeof documentData !== 'object') {
    return <Text>No document data found for this project.</Text>;
  }

  const categories = Object.entries(documentData).filter(
    ([key]) => key !== '_meta'
  );

  return (
    <Flex direction="column" gap="medium">
      <Text variant="heading">Document Checklist</Text>
      <Text variant="microcopy">
        Use the admin portal for full editing (add documents, change statuses).
      </Text>
      <Divider />
      {categories.map(([key, category]) => (
        <Flex key={key} direction="column" gap="xs">
          <Flex justify="between">
            <Text format={{ fontWeight: 'bold' }}>
              {category.label || key}
            </Text>
            <Tag variant={category.status === 'active' ? 'success' : 'default'}>
              {category.status}
            </Tag>
          </Flex>
          {category.documents?.length > 0 ? (
            <Flex direction="column" gap="xs">
              {category.documents.map((doc, i) => (
                <Flex key={i} justify="between" align="center">
                  <Text>{doc.name}</Text>
                  <Tag
                    variant={
                      doc.status === 'accepted'
                        ? 'success'
                        : doc.status === 'pending_review'
                          ? 'warning'
                          : doc.status === 'needs_resubmission'
                            ? 'error'
                            : 'default'
                    }
                  >
                    {doc.status}
                  </Tag>
                </Flex>
              ))}
            </Flex>
          ) : (
            <Text variant="microcopy">No documents</Text>
          )}
        </Flex>
      ))}
    </Flex>
  );
}
