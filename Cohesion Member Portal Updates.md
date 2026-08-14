COHES ION DOCUMENT PORTAL / PHASE 2

## Portal Enhancements: Uploads & Client Messaging

Upload capacity, multi-document submission, and portal-wide banner

## 01 BACKGROUND

Since the Cohesion Document Portal launched, client feedback on 2025 tax document submissions has surfaced two constraints that are driving work back into email. The per-file upload ceiling is too low for common tax documents, and each document request accepts only a single file, so clients with multiple supporting documents for one item cannot submit them through the portal.

Cohesion has also asked for a banner to communicate with clients inside the portal. This scope covers both upload enhancements and presents the banner as two options. In-browser preview was reviewed and is intentionally excluded, as the portal already surfaces the uploaded file name on submission.

## 02 SCOPE

## 2.1 Increased Upload Size Limit

- Raise the per-file upload ceiling well above the current 5 MB, with the target confirmed at kickoff.

- Update server, application, and hosting-layer request limits so large files are accepted end to end.

- Move large-file uploads to a direct-to-storage path so submissions are not constrained by application request timeouts.

- Update client-side validation and error messaging so a failed upload tells the client what to do next.

- Add an upload progress indicator, necessary once files of this size are permitted.

- Cross-browser and mobile-web testing, including large-file and slow-connection cases.

\$3,000

## 2.2 Multiple Documents Per Category

- Change the document model from one file per request item to many, preserving existing submissions in place.

- Allow clients to select and upload multiple files at once against a single document request or category.

- Display all files already submitted for each item, so clients can confirm what has been received.

- Allow clients to remove or replace an individual file prior to review, without affecting the others.

- Update the admin review view so staff see and can act on every file attached to an item.

- Update the submission confirmation notification to list each file included in the submission.

- Cross-browser and mobile-web testing, staging environment for Cohesion review, and production deployment.

\$3,000

## 03 PORTAL BANNER — SELECT ONE

Both options deliver a banner across all client-facing portal pages. They differ in who controls the content. Option A is included at no charge, but every content change afterward is a development request. Option B puts the banner in Cohesion's hands, adds a call-to-action button, and pays for itself if the message changes more than two or three times a

year.

## 3A Static Banner — Fixed Content

- Banner component built into the client-facing portal layout and displayed on all client-facing pages.

- Content and optional link supplied by Cohesion, hard-coded at build time. One copy revision included.

- Styling consistent with the existing portal design, responsive on mobile.

- Subsequent content or visibility changes require a development request and are billed separately.

Included


- New banner management screen in the admin UI, restricted to authorized staff.

- Edit message text, a call-to-action button with configurable label and destination, and a style selection: informational, warning, or success.

- Toggle the banner on and off without a deployment, taking effect immediately for clients.

- Show the banner on all client-facing pages or a selected subset.

- Preview the banner as clients will see it before publishing.

- Same responsive client-facing rendering as Option A, plus the call-to-action button.

\$6,000

Total with Option A static banner

\$9,000

Total with Option B admin-managed banner

## 04 TIMELINE

Five business days of build, after which the portal is ready for Cohesion to begin UAT. Testing, staging review, and production deployment are included in the scope above. The build window assumes Cohesion confirms the target upload ceiling, and final banner content if Option A is selected, at kickoff.

## 05 ASSUMPTIONS

- The upload ceiling is agreed at kickoff. A target large enough to require re-architecting document storage may need a change order.

- Increased storage or bandwidth cost from larger files is borne by Cohesion under its existing arrangements.

- Cohesion provides final banner content for Option A. Option B ships with plain text, a call-to-action button, and a style selection.

- Cohesion consolidates UAT feedback into a single round per deliverable.

- No changes to authentication, the permissions model, or the existing ShareFile workflow.
