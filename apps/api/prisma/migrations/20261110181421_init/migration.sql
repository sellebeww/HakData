-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'COMMUNITY_REPORTED', 'UNVERIFIED', 'OUTDATED');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('PRIVACY_EMAIL', 'DPO_EMAIL', 'REQUEST_FORM', 'POSTAL_ADDRESS', 'PRIVACY_POLICY_URL');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('VERIFIED', 'NEEDS_CONFIRMATION', 'NOT_VERIFIED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'REVIEWED', 'SENT', 'RESPONDED', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('USER_UPLOADED', 'SYSTEM_RECORDED', 'VERIFIED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ResponseCategory" AS ENUM ('ACKNOWLEDGED', 'ADDITIONAL_INFO_REQUESTED', 'IN_PROGRESS', 'FULFILLED', 'PARTIALLY_FULFILLED', 'REJECTED', 'NO_RESPONSE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('APPROACHING', 'PASSED', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "legalName" TEXT,
    "industry" TEXT NOT NULL,
    "website" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyChannel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "value" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "sourceUrl" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "PrivacyChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelSubmission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "value" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRight" (
    "code" TEXT NOT NULL,
    "article" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "plainMeaning" TEXT NOT NULL,
    "needs" TEXT[],
    "requiresRecordedRequest" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "DataRight_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "LegalRule" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rightCode" TEXT NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL DEFAULT 'REQUEST_RECEIVED',
    "durationHours" INTEGER,
    "calcMethod" TEXT NOT NULL DEFAULT 'CALENDAR_HOURS',
    "applicability" TEXT,
    "exceptions" TEXT,
    "status" "RuleStatus" NOT NULL,
    "verifiedBy" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "LegalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestTemplate" (
    "id" TEXT NOT NULL,
    "rightCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RequestTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rightCode" TEXT NOT NULL,
    "channelId" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "letterBody" TEXT NOT NULL DEFAULT '',
    "templateVersion" INTEGER,
    "sentAt" TIMESTAMP(3),
    "sentVia" TEXT,
    "receivedAt" TIMESTAMP(3),
    "followUpDays" INTEGER NOT NULL DEFAULT 14,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deadline" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "basisNote" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Deadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "verification" "EvidenceSource" NOT NULL DEFAULT 'SYSTEM_RECORDED',
    "evidenceId" TEXT,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "source" "EvidenceSource" NOT NULL DEFAULT 'USER_UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyResponse" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "category" "ResponseCategory" NOT NULL,
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "evidenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledReminder" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "queuedAt" TIMESTAMP(3),
    "firedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_industry_idx" ON "Company"("industry");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyChannel_companyId_type_value_key" ON "PrivacyChannel"("companyId", "type", "value");

-- CreateIndex
CREATE INDEX "ChannelSubmission_status_idx" ON "ChannelSubmission"("status");

-- CreateIndex
CREATE INDEX "LegalRule_rightCode_effectiveFrom_idx" ON "LegalRule"("rightCode", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "LegalRule_ruleKey_version_key" ON "LegalRule"("ruleKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RequestTemplate_rightCode_version_key" ON "RequestTemplate"("rightCode", "version");

-- CreateIndex
CREATE INDEX "PrivacyRequest_userId_status_idx" ON "PrivacyRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "PrivacyRequest_companyId_rightCode_idx" ON "PrivacyRequest"("companyId", "rightCode");

-- CreateIndex
CREATE UNIQUE INDEX "Deadline_requestId_key" ON "Deadline"("requestId");

-- CreateIndex
CREATE INDEX "TimelineEvent_requestId_occurredAt_idx" ON "TimelineEvent"("requestId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_storageKey_key" ON "Evidence"("storageKey");

-- CreateIndex
CREATE INDEX "CompanyResponse_requestId_idx" ON "CompanyResponse"("requestId");

-- CreateIndex
CREATE INDEX "ScheduledReminder_fireAt_firedAt_idx" ON "ScheduledReminder"("fireAt", "firedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledReminder_requestId_kind_key" ON "ScheduledReminder"("requestId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_idx" ON "OutboxEvent"("publishedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "PrivacyChannel" ADD CONSTRAINT "PrivacyChannel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSubmission" ADD CONSTRAINT "ChannelSubmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSubmission" ADD CONSTRAINT "ChannelSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalRule" ADD CONSTRAINT "LegalRule_rightCode_fkey" FOREIGN KEY ("rightCode") REFERENCES "DataRight"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestTemplate" ADD CONSTRAINT "RequestTemplate_rightCode_fkey" FOREIGN KEY ("rightCode") REFERENCES "DataRight"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PrivacyChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrivacyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "LegalRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrivacyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrivacyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyResponse" ADD CONSTRAINT "CompanyResponse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrivacyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledReminder" ADD CONSTRAINT "ScheduledReminder_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrivacyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
