CREATE TYPE "SimBehavior" AS ENUM ('REPLIES', 'REPLIES_LATE', 'SILENT');
ALTER TABLE "Company" ADD COLUMN "simulation" "SimBehavior";
ALTER TABLE "CompanyResponse" ADD COLUMN "simulated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notification" ADD COLUMN "emailedAt" TIMESTAMP(3);
-- notifikasi lama tidak boleh diemail massal
UPDATE "Notification" SET "emailedAt" = "createdAt";
CREATE TABLE "EmailDelivery" (
  "id" TEXT NOT NULL,
  "requestId" TEXT,
  "kind" TEXT NOT NULL,
  "toAddress" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "contentSha256" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailDelivery_requestId_sentAt_idx" ON "EmailDelivery"("requestId", "sentAt");
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrivacyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
