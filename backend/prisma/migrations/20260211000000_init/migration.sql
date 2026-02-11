-- CreateTable
CREATE TABLE "file_uploads" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "category_key" TEXT NOT NULL,
    "document_index" INTEGER,
    "original_filename" TEXT NOT NULL,
    "stored_filename" TEXT NOT NULL,
    "storage_path" TEXT,
    "hubspot_file_id" TEXT,
    "hubspot_note_id" TEXT,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "uploaded_by_email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "user_email" TEXT,
    "user_type" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_uploads_project_id_idx" ON "file_uploads"("project_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");
