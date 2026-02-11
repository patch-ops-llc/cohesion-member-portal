# Cohesion Document Portal

A consolidated web application for tax document management, replacing the existing HubSpot UI Extension and WordPress portal.

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL)
- HubSpot Private App Access Token

### Setup

1. **Clone and install:**
   ```bash
   # Install backend dependencies
   cd backend
   npm install

   # Install frontend dependencies
   cd ../frontend
   npm install
   ```

2. **Set up environment:**
   ```bash
   # Copy example env file
   cp .env.example .env
   
   # Edit .env with your HubSpot token and other secrets
   ```

3. **Start database:**
   ```bash
   docker-compose up -d
   ```

4. **Run migrations:**
   ```bash
   cd backend
   npm run db:migrate
   ```

5. **Start development servers:**
   ```bash
   # Terminal 1: Backend
   cd backend
   npm run dev

   # Terminal 2: Frontend
   cd frontend
   npm run dev
   ```

6. **Open the app:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - Database UI: http://localhost:8080 (Adminer)

## Project Structure

```
cohesion-portal/
├── frontend/          # React + TypeScript + Vite
├── backend/           # Node.js + Express + TypeScript
├── hubspot/           # HubSpot UI Extension (CRM card)
│   └── src/app/
│       ├── app-hsmeta.json
│       └── cards/     # Document Checklist card
├── HANDOFF.md         # Complete build specification
├── CLAUDE.md          # AI builder guidance
├── docker-compose.yml # Local development database
└── .env.example       # Environment variables template
```

## Documentation

- **HANDOFF.md** - Complete technical specification and implementation guide
- **CLAUDE.md** - AI assistant guidance for building the project

## Key Features

- **Client Portal**: Magic link auth, project list, document upload, progress tracking
- **Admin Dashboard**: Project search, document status management, audit logging
- **HubSpot Integration**: Full sync with CRM custom objects, file manager, notes

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, React Query
- **Backend**: Node.js, Express, TypeScript, Prisma
- **Database**: PostgreSQL
- **Storage**: AWS S3 or Railway Volume
- **Hosting**: Railway

## HubSpot UI Extension

The `hubspot/` directory contains a CRM card that displays document checklist data on `p_client_projects` records in HubSpot.

### Setup

1. **Replace placeholder URLs** with your deployed Railway URL:
   - `hubspot/src/app/app-hsmeta.json` → `permittedUrls.fetch`
   - `hubspot/src/app/cards/DocumentChecklistCard.jsx` → `backendUrl` constant

2. **Install dependencies and upload:**
   ```bash
   npm run hubspot:install
   npm run hubspot:upload
   ```

3. **Local development** (proxy to local backend):
   - Create `hubspot/src/app/local.json` with `{"proxy": {"https://cohesion-member-portal-production.up.railway.app": "http://localhost:3000"}}`
   - Run `npm run hubspot:dev` and `npm run dev` (backend)

4. **Add the card** to custom object record views in HubSpot: CRM → Customize → add "Document Checklist" card.

## Deployment

Deploy to Railway:

1. Connect GitHub repository
2. Add PostgreSQL service
3. Configure environment variables
4. Deploy

See Railway documentation for detailed instructions.
