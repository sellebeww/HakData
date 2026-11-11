-- CreateEnum
CREATE TYPE "CloseReason" AS ENUM ('CANCELLED', 'WITHDRAWN', 'RESOLVED', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "DeadlineBasis" AS ENUM ('SENT_ESTIMATE', 'RECEIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RequestStatus" ADD VALUE 'ACKNOWLEDGED';
ALTER TYPE "RequestStatus" ADD VALUE 'OVERDUE';
ALTER TYPE "RequestStatus" ADD VALUE 'ESCALATED';

-- DropIndex
DROP INDEX "ChannelSubmission_status_idx";

-- DropIndex
DROP INDEX "CompanyResponse_requestId_idx";

-- DropIndex
DROP INDEX "OutboxEvent_publishedAt_idx";

-- AlterTable
ALTER TABLE "Deadline" ADD COLUMN     "basis" "DeadlineBasis" NOT NULL DEFAULT 'SENT_ESTIMATE',
ADD COLUMN     "ruleVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "timeScale" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "LegalRule" ADD COLUMN     "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "OutboxEvent" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PrivacyRequest" ADD COLUMN     "closeReason" "CloseReason",
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "overdueAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ScheduledReminder" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "ruleVersion" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DossierExport" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "ruleVersion" INTEGER,
    "eventCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DossierExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DossierExport_requestId_createdAt_idx" ON "DossierExport"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationReport_resolvedAt_createdAt_idx" ON "ModerationReport"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ChannelSubmission_status_createdAt_idx" ON "ChannelSubmission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ChannelSubmission_userId_idx" ON "ChannelSubmission"("userId");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "CompanyResponse_requestId_receivedAt_idx" ON "CompanyResponse"("requestId", "receivedAt");

-- CreateIndex
CREATE INDEX "Deadline_dueAt_idx" ON "Deadline"("dueAt");

-- CreateIndex
CREATE INDEX "Deadline_ruleId_idx" ON "Deadline"("ruleId");

-- CreateIndex
CREATE INDEX "Evidence_requestId_idx" ON "Evidence"("requestId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_createdAt_idx" ON "OutboxEvent"("publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyChannel_companyId_status_idx" ON "PrivacyChannel"("companyId", "status");

-- CreateIndex
CREATE INDEX "PrivacyRequest_userId_createdAt_idx" ON "PrivacyRequest"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PrivacyRequest_channelId_idx" ON "PrivacyRequest"("channelId");

-- CreateIndex
CREATE INDEX "PrivacyRequest_status_sentAt_idx" ON "PrivacyRequest"("status", "sentAt");

-- AddForeignKey
ALTER TABLE "DossierExport" ADD CONSTRAINT "DossierExport_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrivacyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierExport" ADD CONSTRAINT "DossierExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: akun yang ada sebelum verifikasi email dianggap terverifikasi; salinan versi aturan pada tenggat; sumber aturan VERIFIED.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;
UPDATE "Deadline" d SET "ruleVersion" = r."version" FROM "LegalRule" r WHERE d."ruleId" = r."id";
UPDATE "LegalRule" SET "sourceRef" = "legalBasis" WHERE status = 'VERIFIED' AND "sourceRef" IS NULL;

-- CHECK constraint (SCHEMA_DESIGN bagian 3). Yang merujuk nilai enum baru (OVERDUE, ESCALATED) ditunda: nilai enum baru
-- tidak boleh dipakai dalam transaksi yang sama, dan state machine barunya belum diterapkan.
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT pr_followup_chk CHECK ("followUpDays" BETWEEN 1 AND 90);
ALTER TABLE "Deadline" ADD CONSTRAINT dl_due_chk CHECK ("dueAt" IS NULL OR "dueAt" >= "startedAt");
ALTER TABLE "Deadline" ADD CONSTRAINT dl_scale_chk CHECK ("timeScale" >= 1);
ALTER TABLE "Evidence" ADD CONSTRAINT ev_chk CHECK (size > 0 AND size <= 10485760 AND sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE "LegalRule" ADD CONSTRAINT lr_dur_chk CHECK ("durationHours" IS NULL OR "durationHours" > 0);
ALTER TABLE "LegalRule" ADD CONSTRAINT lr_verified_chk CHECK (status <> 'VERIFIED' OR ("sourceRef" IS NOT NULL AND "verifiedBy" IS NOT NULL));

-- Partial index untuk rekonsiliasi
CREATE INDEX deadline_open_due_idx ON "Deadline" ("dueAt") WHERE "completedAt" IS NULL AND "dueAt" IS NOT NULL;
CREATE INDEX reminder_pending_idx ON "ScheduledReminder" ("fireAt") WHERE "firedAt" IS NULL;
CREATE INDEX outbox_unpublished_idx ON "OutboxEvent" ("createdAt") WHERE "publishedAt" IS NULL;
