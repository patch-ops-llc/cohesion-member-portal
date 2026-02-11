# Cohesion Document Portal - Complete Build Handoff

> **Project Type:** Full-stack web application  
> **Hosting:** Railway  
> **Stack:** React + TypeScript (frontend) / Node.js + Express + TypeScript (backend)  
> **Target:** Replace existing WordPress portal and HubSpot UI Extension

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Data Model](#data-model)
4. [Feature Requirements](#feature-requirements)
5. [API Specification](#api-specification)
6. [Database Schema](#database-schema)
7. [Project Structure](#project-structure)
8. [Implementation Guide](#implementation-guide)
9. [Reference Code](#reference-code)
10. [Environment Variables](#environment-variables)
11. [Build Order](#build-order)
12. [Dependencies](#dependencies)

---

## Project Overview

### What We're Building

A consolidated web application that replaces a fragmented system consisting of:
- **HubSpot UI Extension** - Staff interface for managing document categories/statuses
- **WordPress Portal** - Client-facing document upload interface (~2500 lines JS)
- **WordPress PHP Backend** - File upload handling (~2200 lines PHP)

### Business Context

This is a **tax document management system** for an accounting firm:
- **Clients** log in to upload tax documents (W-2s, 1099s, K-1s, etc.)
- **Staff** review uploads and update statuses (accept, reject, request resubmission)
- All data is stored in **HubSpot CRM** on a custom object called `p_client_projects`
- Files are uploaded to **HubSpot File Manager** and attached via Notes

### Key Constraints

1. **HubSpot is the source of truth** - All document data lives in a JSON field called `document_data`
2. **Preserve existing data model** - The `document_data` structure must remain compatible
3. **WordPress integration** - The new app will be accessed via redirects from the client's WordPress site
4. **Concurrent editing** - Both clients and staff may edit the same project; merging is required

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           RAILWAY PLATFORM                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐      ┌──────────────────┐     ┌────────────────┐  │
│  │                  │      │                  │     │                │  │
│  │  React Frontend  │◄────►│  Express Backend │◄───►│   PostgreSQL   │  │
│  │  (Vite + TS)     │      │  (Node.js + TS)  │     │   (Sessions)   │  │
│  │                  │      │                  │     │                │  │
│  └──────────────────┘      └────────┬─────────┘     └────────────────┘  │
│                                     │                                    │
│                                     │                                    │
│                                     ▼                                    │
│                            ┌──────────────────┐                          │
│                            │   File Storage   │                          │
│                            │  (S3 or Volume)  │                          │
│                            └──────────────────┘                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HubSpot API
                                      ▼
                         ┌──────────────────────────┐
                         │       HubSpot CRM        │
                         │                          │
                         │  - Custom Object:        │
                         │    p_client_projects     │
                         │  - File Manager          │
                         │  - Notes API             │
                         │  - Associations API      │
                         └──────────────────────────┘
```

### User Flows

**Client Flow:**
1. Client visits WordPress site → redirected to Railway app
2. Enters email → receives magic link
3. Clicks link → authenticated, sees their projects
4. Selects project → sees document checklist with "pizza tracker" progress
5. Uploads files → status changes to "pending_review"

**Staff Flow:**
1. Staff visits `/admin` → authenticates with HubSpot OAuth or API key
2. Searches/filters projects
3. Reviews uploaded documents
4. Updates statuses (accept, reject, request resubmission)

---

## Data Model

### HubSpot Custom Object

**Object Type ID:** `2-171216725`  
**Object Name:** `p_client_projects`

### The `document_data` Field

This is a **JSON string** stored in a text property. It contains ALL document tracking data.

```typescript
interface DocumentData {
  _meta: {
    selectedSections: string[]; // ["personal"] or ["entity"] - array for backward compat
  };
  [categoryKey: string]: CategoryData | { selectedSections: string[] };
}

interface CategoryData {
  label: string;           // Display name, e.g., "W-2s"
  status: "active" | "inactive";
  documents: DocumentEntry[];
}

interface DocumentEntry {
  name: string;            // Document name, e.g., "John Doe W2"
  status: DocumentStatus;
}

type DocumentStatus = 
  | "not_submitted"        // Client hasn't uploaded yet
  | "pending_review"       // Uploaded, awaiting staff review
  | "needs_resubmission"   // Rejected, client must re-upload
  | "missing_files"        // Incomplete upload
  | "accepted";            // Approved by staff
```

### Example `document_data` Value

```json
{
  "_meta": {
    "selectedSections": ["personal"]
  },
  "w_2s": {
    "label": "W-2s",
    "status": "active",
    "documents": [
      { "name": "John Doe W2", "status": "pending_review" },
      { "name": "Jane Doe W2", "status": "accepted" }
    ]
  },
  "1099s": {
    "label": "1099s",
    "status": "active",
    "documents": []
  },
  "k_1s": {
    "label": "K-1s",
    "status": "inactive",
    "documents": []
  },
  "charitable_donations": {
    "label": "Charitable Donations",
    "status": "active",
    "documents": [
      { "name": "Church Donation Receipt", "status": "not_submitted" }
    ]
  }
}
```

### Document Categories

**Personal Tax Return (10 categories):**
```typescript
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
```

**Entity Tax Return (9 categories):**
```typescript
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
```

### Pipeline Stages (for "Pizza Tracker")

**Tax Projects:**
```typescript
const taxStageLabels: Record<string, string> = {
  "1742632656": "Collecting Documents",
  "1742632682": "Processing Return",
  "1742632683": "Processing Return",
  "1742632684": "Processing Return",
  "1742632685": "Processing Return",
  "1742632686": "Return Submitted",
  "1742632687": "Return Submitted",
  "1742632688": "Return Submitted",
  "1742632689": "Return Submitted",
  "1742632690": "Return Submitted",
  "1742632657": "Return Accepted"
};

const taxStages = [
  { id: "collecting", label: "Collecting Documents" },
  { id: "processing", label: "Processing Return" },
  { id: "submitted", label: "Return Submitted" },
  { id: "accepted", label: "Return Accepted" }
];
```

**Advisory Projects:**
```typescript
const advisoryStageLabels: Record<string, string> = {
  "advisory_data_entry": "Data Entry",
  "advisory_data_review": "Data Review",
  "advisory_prepare_reports": "Prepare Financial Reports",
  "advisory_deliver_reports": "Deliver Financial Reports"
};
```

---

## Feature Requirements

### Client Portal Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Magic Link Auth | Email-based passwordless authentication | P0 |
| Project List | Show all projects for authenticated user (matched by email) | P0 |
| Pizza Tracker | Visual progress indicator showing pipeline stage | P0 |
| Document Checklist | List categories with upload buttons per document | P0 |
| File Upload | Drag-and-drop, progress bar, multi-file for 1099s | P0 |
| Status Display | Show pending/accepted/needs resubmission icons | P0 |
| Mobile Responsive | Works on phones/tablets | P1 |

### Admin Dashboard Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Staff Auth | HubSpot OAuth or API key authentication | P0 |
| Project Search | Search/filter all projects | P0 |
| Section Toggle | Switch between Personal/Entity document types | P0 |
| Category Management | Toggle categories on/off | P0 |
| Document Status Update | Accept, reject, request resubmission | P0 |
| Add Documents | Add new document slots to categories | P0 |
| File Preview | View uploaded files | P1 |
| Audit Log | Track who changed what and when | P2 |

### Technical Requirements

| Requirement | Description |
|-------------|-------------|
| Concurrent Edit Handling | Merge local changes with HubSpot data before saving |
| Auto-save | Debounced save (800ms) after user changes |
| File Validation | MIME type, extension, size (5MB), content scanning |
| Rate Limiting | Prevent abuse on upload endpoints |
| CORS | Restrict to WordPress domain and app domain |

---

## API Specification

### Base URL
`https://your-app.railway.app/api`

### Authentication Endpoints

```
POST /auth/magic-link
  Body: { email: string }
  Response: { success: true, message: "Magic link sent" }

GET /auth/verify/:token
  Response: { success: true, token: "jwt...", user: { email, id } }

POST /auth/logout
  Headers: Authorization: Bearer <jwt>
  Response: { success: true }
```

### Project Endpoints (Client)

```
GET /projects
  Headers: Authorization: Bearer <jwt>
  Response: { projects: Project[] }
  Notes: Returns projects where email matches authenticated user

GET /projects/:id
  Headers: Authorization: Bearer <jwt>
  Response: { project: Project, documentData: DocumentData }

POST /projects/:id/upload
  Headers: Authorization: Bearer <jwt>
  Body: FormData { file, categoryKey, documentIndex? }
  Response: { success: true, fileId: string, noteId: string }

PATCH /projects/:id/document-data
  Headers: Authorization: Bearer <jwt>
  Body: { documentData: DocumentData, modifiedFields: ModifiedFields }
  Response: { success: true, mergedData: DocumentData }
```

### Admin Endpoints

```
GET /admin/projects
  Headers: Authorization: Bearer <admin-token>
  Query: ?search=&status=&page=&limit=
  Response: { projects: Project[], total: number, page: number }

GET /admin/projects/:id
  Headers: Authorization: Bearer <admin-token>
  Response: { project: Project, documentData: DocumentData, files: File[] }

PATCH /admin/projects/:id/document-data
  Headers: Authorization: Bearer <admin-token>
  Body: { documentData: DocumentData }
  Response: { success: true }

PATCH /admin/projects/:id/document/:categoryKey/:docIndex/status
  Headers: Authorization: Bearer <admin-token>
  Body: { status: DocumentStatus }
  Response: { success: true }

GET /admin/audit-log
  Headers: Authorization: Bearer <admin-token>
  Query: ?projectId=&action=&startDate=&endDate=
  Response: { entries: AuditEntry[] }
```

### File Endpoints

```
GET /files/:id
  Headers: Authorization: Bearer <jwt>
  Response: File stream

DELETE /files/:id
  Headers: Authorization: Bearer <admin-token>
  Response: { success: true }
```

---

## Database Schema

### PostgreSQL Tables

```sql
-- Users table (clients who log in via magic link)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  hubspot_contact_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

-- Magic link tokens
CREATE TABLE magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Active sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Admin users (staff)
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  hubspot_user_id VARCHAR(50),
  role VARCHAR(50) DEFAULT 'staff',
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

-- File upload metadata (HubSpot is source of truth, this is for quick lookups)
CREATE TABLE file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(50) NOT NULL,
  category_key VARCHAR(100) NOT NULL,
  document_index INTEGER,
  original_filename VARCHAR(500) NOT NULL,
  stored_filename VARCHAR(500) NOT NULL,
  storage_path VARCHAR(1000),
  hubspot_file_id VARCHAR(50),
  hubspot_note_id VARCHAR(50),
  file_size INTEGER,
  mime_type VARCHAR(100),
  uploaded_by UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending_review',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit log for tracking changes
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(100),
  user_id UUID,
  user_type VARCHAR(20), -- 'client' or 'admin'
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_magic_links_expires ON magic_links(expires_at);
CREATE INDEX idx_file_uploads_project ON file_uploads(project_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
```

---

## Project Structure

```
cohesion-portal/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   │   ├── MagicLinkForm.tsx      # Email input for magic link
│   │   │   │   ├── VerifyLink.tsx         # Token verification page
│   │   │   │   └── ProtectedRoute.tsx     # Auth guard
│   │   │   ├── portal/
│   │   │   │   ├── ProjectList.tsx        # List of user's projects
│   │   │   │   ├── ProjectDetail.tsx      # Single project view
│   │   │   │   ├── PizzaTracker.tsx       # Progress visualization
│   │   │   │   ├── DocumentChecklist.tsx  # Main checklist component
│   │   │   │   ├── CategorySection.tsx    # Single category with documents
│   │   │   │   ├── DocumentItem.tsx       # Single document row
│   │   │   │   └── FileUpload.tsx         # Drag-drop file upload
│   │   │   ├── admin/
│   │   │   │   ├── AdminLayout.tsx        # Admin wrapper
│   │   │   │   ├── Dashboard.tsx          # Admin home
│   │   │   │   ├── ProjectManager.tsx     # Project list + search
│   │   │   │   ├── ProjectEditor.tsx      # Edit document statuses
│   │   │   │   ├── DocumentStatusEditor.tsx # Status dropdown
│   │   │   │   └── AuditLog.tsx           # Audit log viewer
│   │   │   └── shared/
│   │   │       ├── Layout.tsx             # App shell
│   │   │       ├── StatusBadge.tsx        # Status indicator
│   │   │       ├── LoadingSpinner.tsx
│   │   │       └── ErrorBoundary.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts                 # Auth context/hook
│   │   │   ├── useProjects.ts             # Project data fetching
│   │   │   ├── useDocumentData.ts         # Document data mutations
│   │   │   └── useFileUpload.ts           # File upload with progress
│   │   ├── services/
│   │   │   ├── api.ts                     # Axios instance
│   │   │   ├── auth.ts                    # Auth API calls
│   │   │   ├── projects.ts                # Project API calls
│   │   │   └── files.ts                   # File API calls
│   │   ├── types/
│   │   │   └── index.ts                   # All TypeScript types
│   │   ├── utils/
│   │   │   ├── documentData.ts            # Parse/serialize helpers
│   │   │   └── validation.ts              # File validation
│   │   ├── styles/
│   │   │   └── globals.css                # Tailwind + custom styles
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts                    # Magic link + session routes
│   │   │   ├── projects.ts                # Client project routes
│   │   │   ├── files.ts                   # File upload/download routes
│   │   │   └── admin.ts                   # Admin routes
│   │   ├── services/
│   │   │   ├── hubspot.ts                 # HubSpot API wrapper
│   │   │   ├── email.ts                   # Magic link email sending
│   │   │   ├── storage.ts                 # S3/volume file storage
│   │   │   └── auth.ts                    # JWT/session management
│   │   ├── middleware/
│   │   │   ├── auth.ts                    # JWT verification
│   │   │   ├── admin.ts                   # Admin auth check
│   │   │   ├── rateLimit.ts               # Rate limiting
│   │   │   └── errorHandler.ts            # Global error handler
│   │   ├── utils/
│   │   │   ├── documentData.ts            # Merge logic
│   │   │   ├── validation.ts              # File validation
│   │   │   └── logger.ts                  # Logging utility
│   │   ├── db/
│   │   │   ├── client.ts                  # Prisma client
│   │   │   └── queries.ts                 # Common queries
│   │   └── index.ts                       # Express app entry
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── package.json
│   └── tsconfig.json
│
├── docker-compose.yml                     # Local dev (postgres)
├── railway.json                           # Railway config
├── .env.example
└── README.md
```

---

## Implementation Guide

### HubSpot Service Layer

The most critical part is the HubSpot integration. Here's the core service:

```typescript
// backend/src/services/hubspot.ts

import { Client } from '@hubspot/api-client';

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

const CUSTOM_OBJECT_TYPE = '2-171216725'; // p_client_projects

export interface Project {
  id: string;
  properties: {
    client_project_name: string;
    email: string;
    hs_pipeline_stage: string;
    document_data: string;
    file_directory?: string;
  };
}

// Get a single project by ID
export async function getProject(projectId: string): Promise<Project> {
  const response = await hubspotClient.crm.objects.basicApi.getById(
    CUSTOM_OBJECT_TYPE,
    projectId,
    ['client_project_name', 'email', 'hs_pipeline_stage', 'document_data', 'file_directory']
  );
  return response as unknown as Project;
}

// Get all projects for a user by email
export async function getProjectsByEmail(email: string): Promise<Project[]> {
  const allProjects: Project[] = [];
  let after: string | undefined;

  do {
    const response = await hubspotClient.crm.objects.basicApi.getPage(
      CUSTOM_OBJECT_TYPE,
      100,
      after,
      ['client_project_name', 'email', 'hs_pipeline_stage', 'document_data']
    );

    const matching = response.results.filter(
      p => p.properties.email?.toLowerCase().trim() === email.toLowerCase().trim()
    );
    allProjects.push(...(matching as unknown as Project[]));

    after = response.paging?.next?.after;
  } while (after);

  return allProjects;
}

// Update document_data field
export async function updateDocumentData(projectId: string, documentData: object): Promise<void> {
  await hubspotClient.crm.objects.basicApi.update(
    CUSTOM_OBJECT_TYPE,
    projectId,
    {
      properties: {
        document_data: JSON.stringify(documentData)
      }
    }
  );
}

// Upload file to HubSpot File Manager
export async function uploadFileToHubSpot(
  filePath: string,
  fileName: string,
  folderId?: string
): Promise<string> {
  const fs = await import('fs');
  const FormData = (await import('form-data')).default;
  const axios = (await import('axios')).default;

  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('options', JSON.stringify({ access: 'PUBLIC_INDEXABLE' }));
  if (folderId) {
    form.append('folderId', folderId);
  }
  form.append('name', fileName);

  const response = await axios.post(
    'https://api.hubapi.com/files/v3/files',
    form,
    {
      headers: {
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
        ...form.getHeaders()
      }
    }
  );

  return response.data.id;
}

// Create note with file attachment
export async function createNoteWithAttachment(
  projectId: string,
  fileId: string,
  noteBody: string
): Promise<string> {
  const response = await hubspotClient.crm.objects.notes.basicApi.create({
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: noteBody,
      hs_attachment_ids: fileId
    },
    associations: [
      {
        to: { id: projectId },
        types: [
          {
            associationCategory: 'USER_DEFINED',
            associationTypeId: 6
          }
        ]
      }
    ]
  });

  return response.id;
}

// Get or create project folder
export async function getOrCreateProjectFolder(
  projectId: string,
  projectName: string,
  email: string
): Promise<string> {
  const project = await getProject(projectId);
  
  // Check if folder already exists
  if (project.properties.file_directory) {
    const match = project.properties.file_directory.match(/folderId=(\d+)/);
    if (match) return match[1];
  }

  // Create new folder
  const folderName = `${email}_${projectName}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  
  const axios = (await import('axios')).default;
  const response = await axios.post(
    'https://api.hubapi.com/files/v3/folders',
    { name: folderName },
    {
      headers: {
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const folderId = response.data.id;
  const folderUrl = `https://app-na2.hubspot.com/files/242796132/?folderId=${folderId}`;

  // Update project with folder URL
  await hubspotClient.crm.objects.basicApi.update(
    CUSTOM_OBJECT_TYPE,
    projectId,
    { properties: { file_directory: folderUrl } }
  );

  return folderId;
}
```

### Document Data Merge Logic

**CRITICAL:** The existing system merges local changes with HubSpot data to prevent overwriting concurrent edits.

```typescript
// backend/src/utils/documentData.ts

interface ModifiedFields {
  sections: boolean;
  categories: Record<string, boolean>;
  documents: Record<string, Record<number, boolean>>;
  statuses: Record<string, Record<number, boolean>>;
}

export async function mergeDocumentData(
  hubspotData: DocumentData,
  localData: DocumentData,
  modifiedFields: ModifiedFields
): Promise<DocumentData> {
  const merged = { ...hubspotData };

  // Update _meta.selectedSections only if modified
  if (modifiedFields.sections && localData._meta) {
    merged._meta = { ...merged._meta, ...localData._meta };
  }

  // Process each category
  for (const categoryKey of Object.keys(localData)) {
    if (categoryKey === '_meta') continue;

    const localCategory = localData[categoryKey] as CategoryData;
    const hubspotCategory = (hubspotData[categoryKey] as CategoryData) || {
      label: localCategory.label,
      status: 'inactive',
      documents: []
    };

    // If entire category was modified (toggled or docs added/removed)
    if (modifiedFields.categories[categoryKey]) {
      const documents = localCategory.documents.map((doc, index) => {
        const hubspotDoc = hubspotCategory.documents[index];
        const statusModified = modifiedFields.statuses[categoryKey]?.[index];

        return {
          name: doc.name,
          status: statusModified 
            ? doc.status 
            : (hubspotDoc?.status || doc.status)
        };
      });

      merged[categoryKey] = {
        label: localCategory.label,
        status: localCategory.status,
        documents
      };
    } 
    // If only specific documents/statuses were modified
    else if (modifiedFields.documents[categoryKey] || modifiedFields.statuses[categoryKey]) {
      const documents = localCategory.documents.map((doc, index) => {
        const hubspotDoc = hubspotCategory.documents[index];
        const docModified = modifiedFields.documents[categoryKey]?.[index];
        const statusModified = modifiedFields.statuses[categoryKey]?.[index];

        return {
          name: docModified ? doc.name : (hubspotDoc?.name || doc.name),
          status: statusModified ? doc.status : (hubspotDoc?.status || doc.status)
        };
      });

      merged[categoryKey] = {
        ...hubspotCategory,
        documents
      };
    }
    // If not modified, keep HubSpot data (already in merged)
  }

  return merged;
}
```

### File Upload Handler

```typescript
// backend/src/routes/files.ts

import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as hubspot from '../services/hubspot';
import * as storage from '../services/storage';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const upload = multer({ 
  dest: '/tmp/uploads',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

router.post('/:projectId/upload', authMiddleware, upload.single('file'), async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { categoryKey, documentIndex } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // 1. Save to local/S3 storage (backup)
    const storedPath = await storage.saveFile(file.path, file.originalname, projectId);

    // 2. Get or create HubSpot folder
    const project = await hubspot.getProject(projectId);
    const folderId = await hubspot.getOrCreateProjectFolder(
      projectId,
      project.properties.client_project_name,
      project.properties.email
    );

    // 3. Upload to HubSpot File Manager
    const hubspotFileId = await hubspot.uploadFileToHubSpot(
      file.path,
      file.originalname,
      folderId
    );

    // 4. Create note with attachment
    const noteId = await hubspot.createNoteWithAttachment(
      projectId,
      hubspotFileId,
      `File uploaded via customer portal: ${file.originalname}`
    );

    // 5. Update document_data status to pending_review
    const documentData = JSON.parse(project.properties.document_data || '{}');
    if (documentData[categoryKey]?.documents?.[documentIndex]) {
      documentData[categoryKey].documents[documentIndex].status = 'pending_review';
      await hubspot.updateDocumentData(projectId, documentData);
    }

    // 6. Log to database
    await db.fileUploads.create({
      data: {
        projectId,
        categoryKey,
        documentIndex: parseInt(documentIndex),
        originalFilename: file.originalname,
        storedFilename: storedPath,
        hubspotFileId,
        hubspotNoteId: noteId,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedBy: req.user.id,
        status: 'pending_review'
      }
    });

    res.json({
      success: true,
      fileId: hubspotFileId,
      noteId
    });
  } catch (error) {
    next(error);
  }
});

export default router;
```

---

## Reference Code

### UI Patterns from Existing CSS

The existing portal uses these key visual patterns:

**Pizza Tracker Steps:**
```css
.tracker-step {
  min-width: 110px;
  min-height: 58px;
  background: #e9ecef;
  color: #2b2f36;
  padding: 20px 24px;
  border-radius: 22px;
  font-size: 1em;
  font-weight: 600;
}
.tracker-step.completed { background: #0f1b5e; color: #fff; }
.tracker-step.current {
  background: #f39c12;
  color: #fff;
  animation: pizza-pulse 1.3s infinite alternate;
}
```

**Status Icons:**
- Not submitted: ⬜ (gray)
- Pending review: ⏱️ (gold/orange)
- Accepted: ✔️ (blue)
- Needs resubmission: Red border, red label
- Missing files: Yellow border, yellow label

**Color Palette:**
- Primary Blue: `#0f1b5e`
- Accent Orange: `#f39c12`
- Success Green: `#28a745`
- Error Red: `#dc3545`
- Warning Yellow: `#ffc107`

---

## Environment Variables

```bash
# .env.example

# HubSpot API
HUBSPOT_ACCESS_TOKEN=pat-na2-xxxxxxxx
HUBSPOT_CLIENT_ID=xxxxxxxx
HUBSPOT_CLIENT_SECRET=xxxxxxxx
HUBSPOT_CUSTOM_OBJECT_TYPE=2-171216725

# Database (Railway provides this)
DATABASE_URL=postgresql://user:pass@host:5432/db

# File Storage
# Option A: AWS S3
AWS_ACCESS_KEY_ID=xxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxx
AWS_S3_BUCKET=cohesion-portal-files
AWS_S3_REGION=us-east-1

# Option B: Railway Volume
FILE_STORAGE_PATH=/data/uploads

# Authentication
JWT_SECRET=xxxxxxxx-generate-a-secure-secret
MAGIC_LINK_SECRET=xxxxxxxx-generate-another-secret
SESSION_EXPIRY_DAYS=7

# Email (SendGrid, Postmark, etc.)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxx
FROM_EMAIL=noreply@example.com
FROM_NAME=Cohesion Portal

# App URLs
FRONTEND_URL=https://portal.clientdomain.com
BACKEND_URL=https://portal.clientdomain.com/api
CORS_ORIGINS=https://clientwordpress.com,https://portal.clientdomain.com

# Admin
ADMIN_API_KEY=xxxxxxxx-for-initial-admin-access

# Node
NODE_ENV=production
PORT=3000
```

---

## Build Order

Follow this order to build the application:

### Phase 1: Project Setup
- [ ] Create new directory structure
- [ ] Initialize frontend with `npm create vite@latest frontend -- --template react-ts`
- [ ] Initialize backend with `npm init -y` and TypeScript setup
- [ ] Set up Tailwind CSS in frontend
- [ ] Set up Prisma in backend
- [ ] Create docker-compose.yml for local PostgreSQL
- [ ] Create .env files

### Phase 2: Backend Core
- [ ] Set up Express app with middleware (cors, json, error handler)
- [ ] Implement Prisma schema and run migrations
- [ ] Implement HubSpot service (getProject, getProjectsByEmail, updateDocumentData)
- [ ] Implement magic link auth (send email, verify token, create session)
- [ ] Implement JWT middleware

### Phase 3: Backend API
- [ ] Implement `/auth/*` routes
- [ ] Implement `/projects` routes (list, get single)
- [ ] Implement `/projects/:id/upload` route
- [ ] Implement `/projects/:id/document-data` route with merge logic
- [ ] Implement `/admin/*` routes

### Phase 4: Frontend Core
- [ ] Set up routing (react-router-dom)
- [ ] Set up API service (axios)
- [ ] Set up auth context/hook
- [ ] Create Layout component
- [ ] Create MagicLinkForm component
- [ ] Create VerifyLink component

### Phase 5: Client Portal
- [ ] Create ProjectList component
- [ ] Create ProjectDetail component
- [ ] Create PizzaTracker component
- [ ] Create DocumentChecklist component
- [ ] Create CategorySection component
- [ ] Create DocumentItem component
- [ ] Create FileUpload component with drag-drop

### Phase 6: Admin Dashboard
- [ ] Create AdminLayout component
- [ ] Create admin auth flow
- [ ] Create Dashboard component
- [ ] Create ProjectManager component (search/filter)
- [ ] Create ProjectEditor component
- [ ] Create DocumentStatusEditor component

### Phase 7: Polish & Deploy
- [ ] Add loading states and error handling
- [ ] Add mobile responsive styles
- [ ] Add rate limiting
- [ ] Set up Railway deployment
- [ ] Configure environment variables in Railway
- [ ] Test end-to-end

---

## Dependencies

### Backend (package.json)

```json
{
  "name": "cohesion-portal-backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate"
  },
  "dependencies": {
    "@hubspot/api-client": "^11.2.0",
    "@prisma/client": "^5.10.0",
    "@aws-sdk/client-s3": "^3.500.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "nodemailer": "^6.9.9",
    "uuid": "^9.0.1",
    "zod": "^3.22.4",
    "express-rate-limit": "^7.1.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/multer": "^1.4.11",
    "@types/nodemailer": "^6.4.14",
    "@types/uuid": "^9.0.8",
    "prisma": "^5.10.0",
    "tsx": "^4.7.1",
    "typescript": "^5.3.3"
  }
}
```

### Frontend (package.json)

```json
{
  "name": "cohesion-portal-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "@tanstack/react-query": "^5.20.0",
    "axios": "^1.6.7",
    "react-dropzone": "^14.2.3",
    "clsx": "^2.1.0",
    "lucide-react": "^0.323.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.56",
    "@types/react-dom": "^18.2.19",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3",
    "vite": "^5.1.0"
  }
}
```

---

## Notes for Builder

1. **Test with real HubSpot data** - You'll need the client's HubSpot API token to test
2. **The `document_data` structure is sacred** - Don't change the format
3. **Merge before save** - Always fetch latest from HubSpot and merge
4. **File uploads are multi-step** - Local save → HubSpot upload → Note creation → Association
5. **Pizza tracker maps stage IDs to labels** - Use the mapping tables provided
6. **Mobile responsive is important** - Clients often use phones

Good luck!
