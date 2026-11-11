<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# Analisis Selisih: MVP yang ada vs brief proyek

Dibuat 11 November 2026 (Fase 0, audit saja, tidak ada kode fitur yang diubah).
Setiap baris di bawah diperiksa langsung di kode (file dan baris disebut). Yang tidak sempat diperiksa ditandai **BELUM DIPERIKSA**.

## Baseline terverifikasi (dijalankan 11 Nov 2026)

| Pemeriksaan | Hasil |
|---|---|
| `npm test` (unit) | 13/13 lulus |
| `npm run test:int` (Postgres + RabbitMQ nyata) | 17/17 lulus |
| `npm run typecheck` (web) dan `npm run typecheck -w @hakdata/api` | bersih |
| `npm run lint` | bersih, **tetapi hanya untuk web**; skrip lint API hanya `tsc --noEmit` (tidak ada ESLint di API) |
| `npm run build` (web) | berhasil |
| `npm run e2e` (Playwright) | **tidak dijalankan di Fase 0** |
| `docker compose up` dari nol | **tidak dijalankan**; compose hanya memuat Postgres dan RabbitMQ, API dan web belum punya Dockerfile |

## Selisih terhadap brief

Keparahan: **K** = inti brief/keamanan, **S** = sedang, **R** = ringan.

| # | Brief | Kondisi sekarang (bukti) | Kep. |
|---|---|---|---|
| 1 | Topologi tenggat: wait-queue per delay tetap → DLX → due-queue → consumer | RabbitMQ **tidak dipakai untuk menunda**. Pemicu waktu = `@Interval(15_000)` yang membaca DB (`notifications.module.ts`), lalu outbox → antrean `reminders` seketika. Antrean `retry` memakai TTL tetap 30 dtk untuk retry saja (`rabbit.service.ts:26-27`) | K |
| 2 | `DEADLINE_TIME_SCALE` untuk mode demo | Tidak ada (grep kosong) | K |
| 3 | State machine DRAFT→SENT→ACKNOWLEDGED→RESPONDED→CLOSED + OVERDUE→ESCALATED | `DRAFT→REVIEWED→SENT→RESPONDED→COMPLETED→CLOSED`; tidak ada ACKNOWLEDGED/OVERDUE/ESCALATED (`request.state.ts`, enum `RequestStatus`). "Lewat tenggat" saat ini hanya turunan `deadlineStatus()`, bukan status tersimpan | K |
| 4 | Consumer idempoten, baca status terbaru dari DB | **Sudah ada**: `handle()` membaca DB, mengabaikan bila bukan `SENT`, `dedupeKey` unik | OK |
| 5 | Cron rekonsiliasi | **Sudah ada** dalam bentuk lain: pengingat ter-queue tapi belum `firedAt` setelah 2 menit di-queue ulang (`REQUEUE_AFTER_MS`). Belum ada rekonsiliasi untuk perpindahan status ke OVERDUE (karena statusnya belum ada) | S |
| 6 | Retry backoff, poison-message ke DLQ terpisah | **Sudah ada**: `MAX_ATTEMPTS=5`, antrean `.failed`. Backoff tetap 30 dtk (bukan eksponensial) | S |
| 7 | Log terstruktur | Hanya `Logger` Nest berformat teks; bukan JSON. Belum ada audit kebocoran PII di log (**BELUM DIPERIKSA**) | S |
| 8 | argon2 untuk password | `bcryptjs` cost 12 (`auth.module.ts:4,26,33`) | K |
| 9 | Validasi zod di web | `zod` tidak ada di `apps/web/package.json` | S |
| 10 | DataLoader (anti N+1) | Tidak ada (grep kosong) | S |
| 11 | Pagination berbasis cursor | Tidak ada; query memakai `take` (mis. `notifications(take)`) | S |
| 12 | Error GraphQL konsisten | `formatError` ada (`app.module.ts:47`); keseragaman kode error **BELUM DIPERIKSA** | R |
| 13 | JWT httpOnly SameSite, helmet, rate limit, depth/complexity | **Sudah ada** (`main.ts`, `app.module.ts`, README bagian Keamanan) | OK |
| 14 | Anti-IDOR dengan test negatif per request/evidence/dossier | Ada test keamanan di `flow.int.ts`; **cakupan per resolver belum dipetakan** (**BELUM DIPERIKSA**) | K |
| 15 | Upload dibatasi ukuran/tipe | `file-type` (magic bytes) + `multer`; batas ukuran **BELUM DIPERIKSA** | S |
| 16 | k-anonymity pada statistik publik | README menyebut "ambang sampel minimum"; nilai k dan test **BELUM DIPERIKSA** | S |
| 17 | Mailpit (SMTP tangkap-semua), email dev | Tidak ada. `system-architecture.md:10` secara sadar menyatakan "email tidak diimplementasikan" | S |
| 18 | Postman collection | Tidak ada | R |
| 19 | Monorepo `packages/shared` | Tidak ada; workspaces hanya `apps/*`. Brief menyebut "bila perlu" | R |
| 20 | `docs/DECISIONS.md`, `docs/LEGAL_SOURCES.md` | DECISIONS.md dibuat di Fase 0. `legal-research.md` sudah berfungsi seperti LEGAL_SOURCES (URL, tanggal akses, penanda belum-terverifikasi) tetapi namanya beda (lihat D-008) | R |
| 21 | Modul `letters`, `dossier`, `deadlines`, `health` terpisah | Logika surat/dossier/tenggat tergabung di `requests.module.ts`, `requests.service.ts`, `domain/`; modul gabungan `catalog`, `admin`. `health` sudah ada | S |
| 22 | Model `Reminder`, `PrivacyChannel`, `Evidence` (SHA-256) | `ScheduledReminder`, `PrivacyChannel`, `Evidence` ada; hash SHA-256 pada Evidence **BELUM DIPERIKSA** | S |
| 23 | Git, Conventional Commits | Repo belum di-`git init` sebelum sesi ini; sekarang sudah (lihat commit baseline) | OK |

## Hal di MVP yang melebihi atau berbeda dari brief (tidak perlu dibuang)

- Aturan hukum **berversi** di DB (`LegalRule`) dengan status VERIFIED / NEEDS_CONFIRMATION / NOT_VERIFIED; permintaan menyimpan versi aturan yang dipakai. Ini lebih ketat dari "konfigurasi per jenis hak" di brief dan sejalan dengan aturan kerja no. 3.
- Transactional outbox sebelum RabbitMQ (menghindari kehilangan pesan antara commit DB dan publish).
- Direktori kanal dengan status verifikasi, usulan komunitas, moderasi, admin.
- Ekspor data dan hapus akun.
- 6 jenis hak (brief: 4).

## Usulan urutan fase (menunggu persetujuan)

1. **Fase 1: Mesin tenggat + state machine** (selisih 1, 2, 3, 5, 6, 7). Test-first. Inti proyek.
2. **Fase 2: Keamanan** (8, 9, 14, 15, 16 + audit PII log).
3. **Fase 3: GraphQL** (10, 11, 12).
4. **Fase 4: Operasional** (17, 18, Dockerfile agar `docker compose up` jalan dari nol, 19 bila perlu, 21).
5. **Fase 5: Verifikasi hukum** (membaca teks resmi PP 33/2026 bila sudah tersedia, memperbarui `legal-research.md`).
