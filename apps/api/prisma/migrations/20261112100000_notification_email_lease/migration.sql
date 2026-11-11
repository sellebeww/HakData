-- Klaim email pengingat menjadi sewa: instance yang mati di tengah kirim tidak membuat email hilang selamanya.
ALTER TABLE "Notification" ADD COLUMN "emailClaimedAt" TIMESTAMP(3);
