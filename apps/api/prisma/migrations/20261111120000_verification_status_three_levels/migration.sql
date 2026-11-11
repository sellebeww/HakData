-- Status verifikasi kanal: UNVERIFIED / COMMUNITY_VERIFIED / OFFICIAL (OUTDATED dilebur ke UNVERIFIED).
CREATE TYPE "VerificationStatus_new" AS ENUM ('UNVERIFIED', 'COMMUNITY_VERIFIED', 'OFFICIAL');
ALTER TABLE "PrivacyChannel" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PrivacyChannel" ALTER COLUMN "status" TYPE "VerificationStatus_new" USING (
  CASE "status"::text
    WHEN 'VERIFIED' THEN 'OFFICIAL'
    WHEN 'COMMUNITY_REPORTED' THEN 'COMMUNITY_VERIFIED'
    ELSE 'UNVERIFIED'
  END
)::"VerificationStatus_new";
DROP TYPE "VerificationStatus";
ALTER TYPE "VerificationStatus_new" RENAME TO "VerificationStatus";
ALTER TABLE "PrivacyChannel" ALTER COLUMN "status" SET DEFAULT 'UNVERIFIED';
