/**
 * Backend URL for the Cohesion Portal API.
 * Update this when deploying to a different environment.
 * Must match the domain in app-hsmeta.json permittedUrls.fetch.
 * If the UIE shows "Could not reach the Cohesion Portal", ensure:
 * - The portal is deployed and accessible at this URL
 * - CORS_ORIGINS on the backend includes HubSpot (https://app.hubspot.com, https://app-eu1.hubspot.com)
 */
export const BACKEND_URL =
  'https://cohesion-member-portal.railway.internal';
