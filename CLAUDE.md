# CLAUDE.md

This file provides guidance when working on the Cohesion Document Portal project.

## Project Overview

This is a **tax document management portal** being built from scratch to replace:
- A HubSpot UI Extension (staff interface)
- A WordPress-embedded JavaScript portal (client interface)
- WordPress PHP backend (file uploads, HubSpot API)

The new system consolidates everything into a single Railway-hosted web app.

## Critical Information

### HubSpot Integration

**IMPORTANT:** All data lives in HubSpot. This app is a frontend for HubSpot data.

- **Custom Object Type ID:** `2-171216725` (p_client_projects)
- **Key Field:** `document_data` - A JSON string containing all document tracking data
- **API Client:** Use `@hubspot/api-client` npm package
- **Auth:** Private App Access Token (stored in `HUBSPOT_ACCESS_TOKEN` env var)

### The `document_data` Structure

This structure MUST be preserved exactly for backward compatibility:

```json
{
  "_meta": { "selectedSections": ["personal"] },
  "w_2s": {
    "label": "W-2s",
    "status": "active",
    "documents": [{ "name": "John W2", "status": "pending_review" }]
  }
}
```

**Document Statuses:** `not_submitted`, `pending_review`, `needs_resubmission`, `missing_files`, `accepted`
**Category Statuses:** `active`, `inactive`

### Concurrent Edit Handling

**CRITICAL:** The system must handle concurrent edits from clients and staff.

Before saving any changes:
1. Fetch the latest `document_data` from HubSpot
2. Merge local changes with fetched data
3. Only overwrite fields that were explicitly modified
4. Save the merged result

See `HANDOFF.md` for the merge algorithm implementation.

## Architecture

```
frontend/          # React + TypeScript + Vite + Tailwind
backend/           # Node.js + Express + TypeScript + Prisma
├── src/
│   ├── routes/    # Express routes
│   ├── services/  # HubSpot, email, storage services
│   ├── middleware/# Auth, rate limiting
│   └── utils/     # Document data helpers
└── prisma/        # Database schema
```

## Commands

### Frontend
```bash
cd frontend
npm install
npm run dev        # Start dev server (port 5173)
npm run build      # Production build
```

### Backend
```bash
cd backend
npm install
npm run dev        # Start dev server with tsx watch
npm run build      # TypeScript compile
npm start          # Run production build
npm run db:migrate # Run Prisma migrations
```

### Database (Local)
```bash
docker-compose up -d  # Start PostgreSQL
```

## Key Implementation Details

### File Upload Flow

1. Client selects file(s)
2. Frontend sends to `/api/projects/:id/upload`
3. Backend validates file (type, size, content)
4. Backend saves to local storage (S3 or volume)
5. Backend uploads to HubSpot File Manager
6. Backend creates HubSpot Note with file attachment
7. Backend associates Note with project
8. Backend updates `document_data` status to `pending_review`

### Magic Link Authentication

1. User enters email on login page
2. Backend creates magic link token, stores in DB with expiry
3. Backend sends email with link
4. User clicks link → frontend hits `/api/auth/verify/:token`
5. Backend validates token, creates JWT session
6. Frontend stores JWT, uses for all API requests

### Project Lookup

Projects are matched by email:
- Fetch all projects from HubSpot (with pagination)
- Filter where `email` property matches authenticated user's email
- Case-insensitive, trimmed comparison

## File Structure Conventions

- Components: PascalCase (`ProjectList.tsx`)
- Hooks: camelCase with `use` prefix (`useProjects.ts`)
- Services: camelCase (`hubspot.ts`)
- Types: All in `types/index.ts`

## Environment Variables

Required for development:
- `HUBSPOT_ACCESS_TOKEN` - HubSpot Private App token
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT signing
- `MAGIC_LINK_SECRET` - Secret for magic link tokens

See `.env.example` for full list.

## Testing Approach

1. Test HubSpot integration first with real API token
2. Test file upload flow end-to-end
3. Test concurrent edit scenarios (two tabs, modify same project)
4. Test mobile responsiveness

## Common Pitfalls

1. **Don't forget pagination** - HubSpot returns max 100 records per request
2. **JSON parsing** - `document_data` is a string, must be parsed
3. **File size limit** - 5MB max, validate on frontend AND backend
4. **Rate limiting** - HubSpot has API rate limits, handle 429 errors
5. **CORS** - Configure for WordPress domain access

## Reference Documentation

- [HubSpot API Client](https://github.com/HubSpot/hubspot-api-nodejs)
- [HubSpot Files API](https://developers.hubspot.com/docs/api/files/files)
- [HubSpot Notes API](https://developers.hubspot.com/docs/api/crm/notes)
- [Railway Deployment](https://docs.railway.app/)

## Build Priority

Start with these in order:
1. Backend HubSpot service (get/update document_data)
2. Backend auth (magic links)
3. Frontend auth flow
4. Frontend project list
5. Frontend document checklist
6. File upload
7. Admin dashboard
