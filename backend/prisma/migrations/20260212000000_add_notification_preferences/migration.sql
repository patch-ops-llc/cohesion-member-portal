-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_reset" BOOLEAN NOT NULL DEFAULT true,
    "portal_registration" BOOLEAN NOT NULL DEFAULT true,
    "document_submission" BOOLEAN NOT NULL DEFAULT true,
    "weekly_update" BOOLEAN NOT NULL DEFAULT true,
    "admin_registration" BOOLEAN NOT NULL DEFAULT true,
    "admin_document_submission" BOOLEAN NOT NULL DEFAULT true,
    "admin_weekly_update" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_email_key" ON "notification_preferences"("email");

-- CreateIndex
CREATE INDEX "notification_preferences_email_idx" ON "notification_preferences"("email");
