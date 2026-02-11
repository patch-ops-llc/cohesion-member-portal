# Cohesion Document Checklist – Spec Compliance

This document confirms how the portal build aligns with the Cohesion Document Checklist specs.

## Feature Flow (Intended)

1. **Internal team** sets documents needed in HubSpot or admin dashboard  
2. **Client** uploads each document in the portal  
3. **Files** are saved in HubSpot (File Manager, Notes, associations)  
4. **Document statuses** on the UIE are updated  
5. **Internal team** approves or kicks back; changes sync to the client portal  

## Implementation Status

### ✅ HubSpot UIE (Document Checklist Card)

- **Location**: `hubspot/src/app/cards/DocumentChecklistCard.jsx`  
- **Behavior**: Reads `document_data` from backend; shows categories and document statuses  
- **Backend**: `GET /api/cards/projects/:id` (no auth required for UIE fetch)  
- **Config**: `BACKEND_URL` in `hubspot/src/app/config.js` must match your deployment  

**"Could not reach the Cohesion Portal" troubleshooting**

- Confirm the portal is deployed at the URL in `config.js`  
- Ensure `config.js` `BACKEND_URL` matches `app-hsmeta.json` `permittedUrls.fetch`  
- Add HubSpot domains to backend `CORS_ORIGINS`: `https://app.hubspot.com`, `https://app-eu1.hubspot.com`  

### ✅ Client Portal (document upload)

- **Flow**: Client signs in → project list → project detail → document checklist  
- **Upload**: Documents with `not_submitted`, `needs_resubmission`, or `missing_files` show an **Upload** button  
- **Upload panel**: Dropzone below the document row; drag & drop or click to select  
- **Backend**: `POST /api/files/:projectId/upload` with `categoryKey`, `documentIndex`, `file`  

### ✅ HubSpot File Integration (per HUBSPOT_FILE_UPLOAD.md)

- **Saves locally** (backup / admin review)  
- **Uploads to HubSpot File Manager** via API  
- **Creates HubSpot Note** with attachment  
- **Associates Note** with project  
- **Updates `document_data`** status to `pending_review` after upload  
- **Creates HubSpot folder** per project and stores `file_directory` on the project  

### ✅ Admin Dashboard

- **Location**: `/admin/projects/:projectId`  
- **Capabilities**:
  - Add documents (with category)
  - Remove documents
  - Edit document names
  - Change status (approve / needs resubmission / etc.)
  - Toggle category active/inactive
  - Link to HubSpot Files folder  

### ✅ document_data Structure

- Same structure as Checklist spec: `_meta`, categories, documents, statuses  
- Statuses: `not_submitted`, `pending_review`, `needs_resubmission`, `missing_files`, `accepted`  
- Category statuses: `active`, `inactive`  

### ✅ Client / Admin Separation

- **Client view**: Only upload; no add/edit/remove  
- **Admin view**: Full document management (add, remove, edit, status)  

## File Changes Summary

| File | Change |
|------|--------|
| `DocumentItem.tsx` | Upload panel layout fix; `clientMode` prop; status editor for admin |
| `CategorySection.tsx` | `clientMode`; category active/inactive toggle; `isSaving` |
| `DocumentChecklist.tsx` | `clientMode`, `isSaving` props |
| `ProjectDetail.tsx` | `clientMode={true}` for client-only view |
| `ProjectEditor.tsx` | Full document management via `DocumentChecklist` |
| `useDocumentData.ts` | Add document to categories that don’t exist yet |
| `hubspot/config.js` | Troubleshooting notes for "Could not reach" |
| `hubspot/README.md` | Troubleshooting section |
| `.env.example` | CORS_ORIGINS note for HubSpot domains |
