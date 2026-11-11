<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# Arsitektur
Modular monolith NestJS. Modul: Auth, Catalog (hak + aturan hukum), Companies (kanal + moderasi), Requests (generator, state, deadline, dossier, bukti), Notifications (scheduler, outbox, RabbitMQ), Stats, Admin (audit), Audit/Prisma (global). Logika murni ada di `src/domain` (deadline.engine, request.state, letter, rights.catalog) dan diuji tanpa DB.
Web Next.js memanggil `/api/*` (rewrite ke backend) sehingga cookie sesi httpOnly same-origin.
## Keputusan
- **GraphQL**: relasi permintaan→perusahaan→kanal→dossier diambil dalam satu kueri; batas depth 8 dan complexity 300. Upload bukti memakai REST multipart karena GraphQL multipart rawan CSRF/ukuran.
- **RabbitMQ** hanya untuk pengiriman pengingat: ScheduledReminder (DB) → OutboxEvent (satu transaksi) → publish confirm → consumer → Notification dengan `dedupeKey` unik (idempoten). Retry via DLX + queue TTL 30 dtk, maks 5 percobaan lalu ke queue `failed`.
- **Database = sumber kebenaran** untuk waktu kirim, deadline, status, pengingat. TTL RabbitMQ **tidak** dipakai sebagai timer. Rekonsiliasi: pengingat yang di-queue >2 menit tanpa "fired" di-queue ulang. Broker mati: outbox menumpuk dan terkirim saat pulih. Aplikasi restart: scheduler berjalan lagi dari DB.
- Transaksi: pencatatan pengiriman = status + timeline + deadline + pengingat + notifikasi dalam satu `$transaction`.
- **Email tidak diimplementasikan** (in-app saja) agar tidak ada pengiriman tanpa persetujuan; belum ada SMTP.
## Skema alur pengingat
```
recordSent → Deadline + ScheduledReminder(APPROACHING|PASSED|FOLLOW_UP)
tick 15s → enqueueDue (FOR UPDATE SKIP LOCKED) → OutboxEvent → RabbitMQ → handle() → Notification
```
