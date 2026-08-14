# Phase 2 Implementation Plan

Covers the SOW in `Cohesion Member Portal Updates.md`: larger uploads (2.1), multiple files per
document (2.2), and the portal banner (3A / 3B).

---

## 0. Current state (what the code actually does today)

**Upload path** — `backend/src/routes/files.ts:36`, one synchronous request:

```
browser --multipart--> multer (disk, tmp/uploads)
                       -> validateFile()
                       -> storage.saveFile()      copies to ./uploads/<projectId>/  (permanent local copy)
                       -> HubSpot Files API       (axios, streamed from disk)
                       -> HubSpot Note + assoc
                       -> document_data status -> pending_review
                       -> prisma.fileUpload row + auditLog row
                       -> 2 emails (non-blocking)
```

Every one of those hops happens inside the client's HTTP request. That's the timeout exposure the
SOW's "direct-to-storage path" bullet is about.

**The 5 MB ceiling is hardcoded in four places:**

| Location | What |
|---|---|
| [backend/src/utils/validation.ts:72](backend/src/utils/validation.ts#L72) | `maxFileSize`, feeds multer `limits` and `validateFile()` |
| [frontend/src/services/files.ts](frontend/src/services/files.ts) | `maxSize` in client `validateFile()` |
| [frontend/src/components/portal/FileUpload.tsx:51](frontend/src/components/portal/FileUpload.tsx#L51) | dropzone `maxSize` |
| [frontend/src/components/portal/FileUpload.tsx:136](frontend/src/components/portal/FileUpload.tsx#L136) | user-facing copy "up to 5MB" |
| [frontend/src/services/files.ts:39](frontend/src/services/files.ts#L39) | error string "must be less than 5MB" |

**The progress bar is fake** — [useFileUpload.ts:52](frontend/src/hooks/useFileUpload.ts#L52) runs a
`setInterval` that walks to 90% regardless of actual bytes sent. Fine at 5 MB, unacceptable at 50 MB.

**Multi-file is closer than it looks.** `file_uploads` is already keyed by
`(projectId, categoryKey, documentIndex)` with no uniqueness constraint — uploading twice against the
same item *already* creates two rows. The gap is that **nothing ever displays them**. `ProjectEditor`
declares `files: FileUpload[]` in its response type and never renders it; the client portal shows only
the document-level status badge. So 2.2 is mostly a read/UI/delete job, not a migration.

**Also found (pre-existing, worth folding in):**

- **Staff cannot upload at all.** The upload route requires a *client* JWT
  ([files.ts:36](backend/src/routes/files.ts#L36), `authMiddleware`), but the admin dashboard
  authenticates with `X-API-Key` and never sets `auth_token`, so the upload button in the admin
  document rows 401s. Confirmed live. This directly blocks the 2.2 bullet "staff see and can act on
  every file attached to an item" — the admin side needs its own authenticated file routes, not just
  a new list component.
- **Admin login reports upstream failures as bad credentials.**
  [AdminLogin.tsx:25-37](frontend/src/components/admin/AdminLogin.tsx#L25-L37) validates the key by
  calling `/api/admin/stats` and checks only `response.ok`, so a HubSpot outage renders as
  "Invalid API key". Verified: a correct key with an unreachable HubSpot returns 500 and locks staff
  out with a misleading message. Same class of defect as the upload error messaging in 2.1.
- `getDownloadUrl()` in `frontend/src/services/files.ts` points at `/api/files/:id/download`, which
  **does not exist** in `routes/files.ts`. Dead code today; we need that route for 2.2 anyway.
- `railway.json` declares **no volume**, so `./uploads` is wiped on every redeploy. HubSpot is the
  durable copy, so nothing is actually lost — but the local copy is pure waste and gets expensive at
  50 MB/file.
- `FILE_STORAGE_PATH` defaults to `./uploads` while the start command does `cd /app/backend`, so files
  land in `/app/backend/uploads`, not the `/app/uploads` the Dockerfile creates.
- The global rate limiter ([index.ts:58](backend/src/index.ts#L58)) is 100 req / 15 min per IP across
  all of `/api`. A client dropping 15 files at once, plus refetches, will start eating that budget.

**The document_data trap.** If we put a per-file list *inside* `document_data`, it gets silently
destroyed on the next save from either surface:

- `mergeDocumentData()` ([documentData.ts:45-79](backend/src/utils/documentData.ts#L45-L79)) rebuilds
  each entry as a literal `{ name, status }` — extra keys dropped.
- `documentEntrySchema` ([validation.ts:19](backend/src/utils/validation.ts#L19)) is a non-strict zod
  object, so it *strips* unknown keys on PATCH.
- The HubSpot UIE card has its own copy of the merge logic that would need the same change.

**→ Decision: keep the per-file index in Postgres; leave `document_data` shape untouched.** The
document-level status in `document_data` becomes a derived roll-up of its files. Backward compatibility
with the CRM card and any other `document_data` consumer is then free, and the merge algorithm doesn't
have to change at all.

---

## 1. Data model changes

One Prisma migration, additive only:

```prisma
model FileUpload {
  // ... existing fields unchanged ...
  storageKey     String?   @map("storage_key")      // object key in S3/R2 for direct uploads
  hubspotFileUrl String?   @map("hubspot_file_url") // for staff download links
  transferStatus String    @default("synced") @map("transfer_status")
      // 'pending' (in bucket, not yet in HubSpot) | 'synced' | 'failed'
  reviewStatus   String    @default("pending_review") @map("review_status")
      // per-file: pending_review | accepted | needs_resubmission
  deletedAt      DateTime? @map("deleted_at")       // soft delete, keeps the audit trail
  deletedBy      String?   @map("deleted_by")

  @@index([projectId, categoryKey, documentIndex])
}
```

Existing rows default to `transferStatus: 'synced'` / `reviewStatus: 'pending_review'`, which is exactly
right — that's the "preserving existing submissions in place" bullet, satisfied by the defaults.

**Status roll-up** (new `backend/src/utils/fileStatus.ts`), applied whenever a file is added, removed,
or reviewed:

| Files on the item | Document status written to `document_data` |
|---|---|
| any `needs_resubmission` | `needs_resubmission` |
| none, and staff marked the item | preserve staff's explicit choice (`missing_files` etc.) |
| ≥1 file, all `accepted` | `accepted` |
| ≥1 file, at least one pending | `pending_review` |
| zero live files | `not_submitted` |

Writes go through the existing `mergeDocumentData` path so concurrent-edit handling is unchanged.

---

## 2. Scope 2.1 — Larger uploads

Delivered in two layers so there's a working, shippable state at each step.

### 2.1a — Raise the ceiling (no new infrastructure)

1. Replace the four hardcoded constants with one source of truth: `MAX_UPLOAD_BYTES` in
   `backend/src/utils/validation.ts`, exposed to the frontend via an existing config/bootstrap response
   (or `VITE_MAX_UPLOAD_MB`) so the two can never drift again.
2. **Drop the permanent local copy.** Stream multer's temp file straight to the HubSpot Files API and
   delete the temp file. Saves a full-size disk write and a full-size read per upload. Retire
   `storage.saveFile()` usage on this path.
3. Explicit limits at every layer that can silently truncate: multer `limits.fileSize`, `express.json`
   (unrelated but currently default 100 kb — set it deliberately), and a documented note that Railway's
   edge does not impose a body cap but does time out idle connections.
4. Real progress: `axios onUploadProgress` in `useFileUpload`, replacing the `setInterval`.
5. Error messages that tell the client what to do: distinguish *too large* (with the actual limit and
   the file's size), *wrong type*, *network dropped mid-upload* (offer retry), and *server rejected*.
   Multer's `LIMIT_FILE_SIZE` error currently surfaces as a generic 500 — needs a branch in
   `errorHandler`.
6. Separate, higher rate-limit bucket for `POST /api/files/:projectId/upload`.

**⚠ Must verify before committing to a ceiling:** the HubSpot Files v3 API has its own per-file limit,
and it is lower than what people assume. The portal cannot accept a file it can't hand to HubSpot, so
the agreed ceiling has to sit under HubSpot's. First task at kickoff: upload probe files (10/25/50/100
MB) against the real portal token and record where it fails. Everything downstream of the ceiling
depends on that number.

### 2.1b — Direct-to-storage

Browser never sends bytes through Express:

```
1. POST /api/files/:projectId/upload-url   { filename, size, mimeType, categoryKey, documentIndex }
   -> auth + access check + type/size validation
   -> returns presigned PUT url + storageKey, creates file_uploads row (transferStatus: 'pending')

2. browser PUT --> S3/R2 directly (real progress from XHR, no app-server involvement)

3. POST /api/files/:projectId/finalize     { uploadId }
   -> HEAD the object to confirm size/existence (never trust the client)
   -> flip document status to pending_review, queue the HubSpot transfer
   -> returns immediately

4. background worker (reuse services/scheduler.ts, single Railway replica so in-process is fine)
   -> stream object -> HubSpot Files -> Note + association -> transferStatus: 'synced'
   -> on failure: retry w/ backoff, then 'failed' + admin alert
```

The client sees "Uploaded ✓" at step 3. Staff see the file immediately in the portal admin view; it
appears in HubSpot moments later. A `failed` transfer is visible to admins and re-runnable, so a HubSpot
outage never loses a client's file.

**Storage backend:** Railway has no S3 service. Cloudflare R2 is the recommendation — S3-compatible API
(so `@aws-sdk/client-s3` works unchanged), no egress fees, and the presigned-PUT flow is identical to
S3's. AWS S3 is the fallback if Cohesion already has an AWS account they'd rather bill to. Requires
CORS configured on the bucket for the portal origin. This is the one new external dependency in Phase 2
and maps to the SOW assumption that storage/bandwidth cost sits with Cohesion.

---

## 3. Scope 2.2 — Multiple files per document

**Backend** (`backend/src/routes/files.ts`):

| Route | Purpose |
|---|---|
| `GET /api/files/project/:projectId` | all live files for a project, grouped by `categoryKey`/`documentIndex` — one call feeds the whole checklist |
| `GET /api/files/:id/download` | authed redirect to the HubSpot file URL (fixes the existing dead link) |
| `DELETE /api/files/:id` | client-side removal — **only** while that file is `pending_review`; soft-deletes the row, archives the HubSpot file + note, recomputes the roll-up |
| `PATCH /api/admin/files/:id` | staff set per-file `reviewStatus`; recomputes the roll-up |
| `GET /api/admin/projects/:id/files` | staff-side file list, admin-key authenticated |
| `POST /api/admin/projects/:id/upload` | staff upload on a client's behalf — closes the gap where the admin UI's existing upload button 401s against the client-JWT route |

Accepting multiple files in one request is just `upload.array('files', N)` on the existing route (for
the 2.1a path) or N presigned URLs (2.1b path) — either way, per-file success/failure, so one bad file
in a batch of eight doesn't sink the other seven.

**Frontend:**

- `FileUpload.tsx` → `multiple: true`, a queue with per-file progress rows, per-file error state, and
  a "remove from queue" affordance before sending.
- New `SubmittedFileList.tsx` under `components/portal/` — filename, size, upload date, per-file status
  chip, download, and delete-while-pending. Rendered inside `DocumentItem` under the row, shown in both
  client and staff mode.
- `DocumentItem.tsx` — the `needsUpload` gate at
  [line 47](frontend/src/components/portal/DocumentItem.tsx#L47) currently hides the upload control once
  status is `pending_review`/`accepted`. With multi-file, clients need to add a second file to an item
  that's already pending, so this becomes "hide only when `accepted`."
- Files fetched once per project in `ProjectDetail` / `ProjectEditor` and passed down, keyed by
  `${categoryKey}:${documentIndex}` — avoids N requests for N documents.
- **Staff review view** (`ProjectEditor.tsx`) — same list component plus per-file accept / request-resubmission
  controls, which is the "act on every file attached to an item" bullet.

**Email** (`backend/src/services/email.ts:261` and `:289`) — both submission emails take a single
`filename` string today. Change to a `filenames: string[]` and render a list; add a `{{fileList}}`
template variable alongside the existing `{{filename}}` so saved templates keep working. Batch upload
sends **one** email listing all files, not one per file.

**HubSpot UIE card** — reads `document_data` only, and `document_data`'s shape is unchanged, so the card
keeps working with zero edits. Optionally add a per-item file count fetched from the new endpoint; not
required by the SOW.

---

## 4. Scope 3 — Portal banner

**Option B (admin-managed) is the recommendation**, and it's cheap here because the infrastructure
already exists: `AppSetting` is a generic KV table, `adminMiddleware` guards `/api/admin`, and
`components/admin/NotificationSettings.tsx` is a working template for a settings screen.

```ts
// AppSetting key: 'portalBanner'
{
  enabled: boolean,
  message: string,
  style: 'info' | 'warning' | 'success',
  cta: { label: string, url: string } | null,
  pages: 'all' | string[],   // e.g. ['/', '/project/:id']
  updatedAt, updatedBy
}
```

- `GET /api/settings/banner` — unauthenticated (it must render on `/login` too). Cache-Control ~60s.
- `PUT /api/admin/settings/banner` — admin-guarded, writes an `auditLog` row.
- `components/shared/Banner.tsx` — rendered inside `Layout.tsx` above `<main>`, so every client-facing
  page gets it. Three style variants matching the existing Tailwind palette, responsive, dismissible-per-session.
- `components/admin/BannerSettings.tsx` — editor + **live preview using the real `Banner` component**
  (not a mock, so preview can't drift from production), page-scope selection, on/off toggle,
  route in `App.tsx` + nav entry in `AdminLayout.tsx`.
- URL validation on the CTA destination (http/https only) — it's admin-authored content rendered into
  an anchor; render the message as **plain text, never `dangerouslySetInnerHTML`**.

**Option A** is a strict subset: build `Banner.tsx` exactly the same, feed it a constant instead of the
API, skip the admin screen and the settings routes. If A is chosen, structure it so B is a later
drop-in — don't inline the markup into `Layout.tsx`.

---

## 5. Sequence (5 business days)

| Day | Work | Shippable at end of day |
|---|---|---|
| **0 (kickoff)** | Probe HubSpot's real per-file limit; confirm ceiling; confirm banner option; provision R2 bucket + CORS | Ceiling agreed |
| **1** | Prisma migration; `MAX_UPLOAD_BYTES` single source of truth; drop local copy; real progress; error taxonomy; upload rate-limit bucket (2.1a) | Bigger uploads work end to end |
| **2** | Presigned-URL flow + finalize + background HubSpot transfer worker + failure visibility (2.1b) | Large files no longer touch Express |
| **3** | Multi-file backend: list / download / delete / per-file review, status roll-up, email list changes | API complete for 2.2 |
| **4** | Multi-file frontend: upload queue, `SubmittedFileList`, `DocumentItem` gate change, staff review controls | 2.2 feature-complete |
| **5** | Banner (client + admin); cross-browser & mobile pass; large-file and throttled-connection testing; staging deploy | UAT-ready |

Banner Option A collapses day 5's first half to about an hour; Option B is roughly the full half-day
given the existing admin scaffolding.

---

## 6. Test plan

- **Sizes**: 1 KB, 4.9 MB (old boundary), the new ceiling exactly, ceiling + 1 byte (must fail cleanly
  *client-side before any bytes are sent*, and again server-side if the client check is bypassed).
- **Slow connection**: Chrome DevTools "Slow 3G" on a large file — progress must be real and monotonic,
  and the connection must not time out.
- **Interruption**: kill the network mid-PUT; retry must work and must not orphan a `pending` row.
- **Multi-file**: 10 files at once; one oversized and one wrong-type mixed in — the other eight succeed,
  one email listing eight files.
- **Delete/replace**: delete a `pending_review` file → roll-up status recomputes; attempt to delete an
  `accepted` file → refused.
- **Concurrency**: client uploads while staff edits the same item in the HubSpot card — the existing
  merge must still hold, since the roll-up write goes through `mergeDocumentData`.
- **Backward compat**: a project with pre-Phase-2 uploads renders its historical files with no migration
  step; the HubSpot UIE card is unchanged.
- **Failure path**: with an invalid HubSpot token, an upload still succeeds for the client and surfaces
  as `transferStatus: 'failed'` to admins, and is re-runnable once the token is fixed.
- **Mobile web**: iOS Safari + Android Chrome, camera-roll multi-select, background-tab upload.

---

## 7. Open decisions

1. **Upload ceiling** — pending the HubSpot Files API probe. 25 MB covers essentially all scanned tax
   documents; 50 MB covers multi-hundred-page scans.
2. **Banner: A or B.**
3. **Storage bucket** — Cloudflare R2 (recommended) vs AWS S3, and whose account it lives in.
4. **Retention of the local `./uploads` copy** — recommend dropping it entirely (HubSpot + bucket are
   both durable; the local copy is already wiped on redeploy and is only getting bigger).

## 8. Explicitly out of scope

Per the SOW: in-browser preview, and any change to authentication, the permissions model, or the
ShareFile workflow.
