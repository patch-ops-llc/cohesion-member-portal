# Cohesion Document Portal - HubSpot UI Extension

HubSpot CRM card for the `p_client_projects` custom object. Displays document checklist data (categories, documents, statuses) when viewing a project record.

## Structure

```
hubspot/
├── hsproject.json           # Project config
├── src/
│   └── app/
│       ├── config.js             # BACKEND_URL (update for your deployment)
│       ├── app-hsmeta.json       # App config (permittedUrls, scopes)
│       └── cards/
│           ├── DocumentChecklistCard.jsx
│           ├── document-checklist-card-hsmeta.json
│           └── package.json
```

## Setup

1. **Configure the backend URL** in `src/app/config.js`:
   - Set `BACKEND_URL` to your deployed Cohesion Portal URL (e.g. `https://your-app.up.railway.app`)
   - Ensure the same URL is in `src/app/app-hsmeta.json` → `config.permittedUrls.fetch`
   - If you see "Could not reach the Cohesion Portal": verify the portal is deployed, BACKEND_URL matches your deployment, and CORS_ORIGINS includes HubSpot domains (https://app.hubspot.com, https://app-eu1.hubspot.com)

2. **Install dependencies:**
   ```bash
   hs project install-deps
   ```

3. **Upload to HubSpot:**
   ```bash
   hs project upload
   ```

4. **Add the card** to your custom object record view in HubSpot (Customize → Card library → App).

## Local Development

To develop the card against a local backend:

1. Create `src/app/local.json`:
   ```json
   {
     "proxy": {
       "https://cohesion-member-portal-production.up.railway.app": "http://localhost:3000"
     }
   }
   ```

2. Start the backend: `npm run dev` (from project root)

3. Start HubSpot dev: `hs project dev`

The card will proxy fetch requests to your local backend.
