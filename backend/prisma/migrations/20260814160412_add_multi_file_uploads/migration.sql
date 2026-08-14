-- Multiple files per document item.
--
-- Files were already keyed by (project_id, category_key, document_index) with no
-- uniqueness constraint, so storing many per item needs no structural change --
-- the per-file review state reuses the existing `status` column.
--
-- What is new is the handoff: uploads are acknowledged once the file is durable
-- on the persistent volume, and pushed to HubSpot afterwards. These columns
-- track that gap so a file can never be silently stranded between the two.

-- AlterTable
ALTER TABLE "file_uploads" ADD COLUMN     "transfer_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transfer_error" TEXT,
ADD COLUMN     "transfer_status" TEXT NOT NULL DEFAULT 'pending';

-- Existing rows predate the staged flow: their files are already in HubSpot.
UPDATE "file_uploads" SET "transfer_status" = 'synced';

-- CreateIndex
CREATE INDEX "file_uploads_project_id_category_key_document_index_idx" ON "file_uploads"("project_id", "category_key", "document_index");

-- CreateIndex
CREATE INDEX "file_uploads_transfer_status_idx" ON "file_uploads"("transfer_status");
