<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# ROADMAP: Fase 1-8

Status: **Diusulkan (Fase 0), menunggu persetujuan.** Estimasi jam adalah perkiraan kerja fokus satu orang dibantu AI, **bukan janji**; total ±66 jam. Dasar: [GAP_ANALYSIS.md](GAP_ANALYSIS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md), [SPEC.md](SPEC.md). Setiap fase berakhir dengan commit Conventional Commits dan semua test lulus.

## 0. Yang TIDAK boleh dipangkas (agar demo tetap kuat)

Demo kuat bila penonton melihat tiga hal bekerja **dan** tahan gangguan. Lima potongan ini adalah tulang punggung; semuanya ada di Fase 1, 5, 6, 7:

| # | Tidak boleh dipangkas | Kenapa | Fase |
|---|---|---|---|
| K1 | State machine baru + `OVERDUE` otomatis lewat tangga wait-queue + `DEADLINE_TIME_SCALE` | Inti brief dan klimaks demo: 72 jam menjadi menit, status berubah sendiri | 1 |
| K2 | Idempotensi + rekonsiliasi **dengan test** (pesan ganda, broker mati, purge, restart) | Pembeda teknis; "matikan RabbitMQ di tengah demo" harus lolos | 1 |
| K3 | Kejujuran hukum: tenggat hanya dari aturan VERIFIED, label "estimasi", disclaimer, tanpa hitung mundur untuk hapus/keberatan | Risiko reputasi dan hukum terbesar (SPEC R3, R5) | 1, 5 |
| K4 | Dossier ekspor (linimasa + bukti ber-SHA-256 + versi aturan) | Nilai jual "permohonan tercatat" | 6 |
| K5 | Anti-IDOR + test negatif per resolver, dan `docker compose up` dari nol | Satu kebocoran atau demo yang tidak bisa dijalankan juri menggugurkan sisanya | 2, 4 |

Urutan memangkas bila waktu mepet, **dari yang pertama dikorbankan** (bagian 2): email/Mailpit → Postman → ESLint API → `packages/shared` → zod di web → DataLoader → cursor pagination → argon2 → verifikasi email → PDF dossier → ModerationReport. Jangan pernah memangkas K1-K5.

## 1. Fase

### Fase 1: Mesin tenggat + state machine (±16 jam) **[K1, K2, K3]**
Test-first. Menutup GAP #1, 2, 3, 5, 6, 7 dan menerapkan D-003, D-005.
- Migrasi enum `RequestStatus` + `CloseReason` + kolom baru + CHECK (SCHEMA_DESIGN bagian 2-3).
- `domain/request.state.ts` dengan tabel transisi baru; conditional update + `version`.
- `Deadlines.clock` (`DEADLINE_TIME_SCALE`, pengaman produksi).
- Topologi: `hd.delay`, tingkat `wait.*`, `hd.due`, `due.reminders`, `hd.retry`, `*.failed`; publisher confirm; tangga lompat.
- `applyReminder` dan `applyOverdue` dipakai bersama konsumen dan cron 60 dtk (advisory lock).
- Retry eksponensial + DLQ; log JSON dengan redaksi.
- **Selesai bila**: unit test tabel transisi (semua pasangan sah/tidak sah); integration test (a) pesan ganda (b) dua konsumen paralel (c) broker mati saat tenggat lalu hidup (d) purge queue lalu rekonsiliasi (e) restart di tengah tangga, semuanya hijau dengan Postgres + RabbitMQ nyata; dengan `SCALE=1440` permintaan `SENT` menjadi `OVERDUE` dalam ±3 menit tanpa intervensi; permintaan dengan aturan belum terverifikasi tidak pernah `OVERDUE`; 13 unit + 17 integrasi lama tetap lulus atau diganti dengan padanan yang disetujui.

### Fase 2: Keamanan (±8 jam) **[K5]**
GAP #8, 9, 14, 15, 16.
- Peta resolver × test negatif IDOR (request, evidence, dossier, notifikasi, ekspor); tambahkan yang belum ada.
- Upload: batas ukuran (10 MB) dan kuota per pengguna; cek ulang magic bytes.
- k-anonymity: tetapkan nilai k, test di bawah dan di atas ambang.
- Audit PII di log dan pesan broker.
- *Boleh dipangkas*: argon2 + rehash (D-006, ±1,5 jam); zod di web (±2 jam).
- **Selesai bila**: setiap query/mutasi milik pengguna punya test "pengguna B mendapat NOT_FOUND"; tes statistik lulus; grep log/pesan tidak menemukan email atau isi surat.

### Fase 3: GraphQL (±7 jam)
GAP #10, 11, 12; SCHEMA_DESIGN bagian 4.
- Daftarkan enum; kode error seragam (`ErrorCode`); `allowedTransitions`, `Deadline.state` dihitung server.
- Cursor pagination untuk `myRequests`, `notifications`, `companies`.
- DataLoader untuk relasi.
- *Boleh dipangkas*: DataLoader (±2,5 jam) bila tidak ada N+1 terukur; cursor pagination (±3 jam) cukup di `myRequests`.
- **Selesai bila**: introspeksi non-produksi cocok dengan SDL; query daftar 20 permintaan menghasilkan jumlah query SQL konstan (diukur di test); semua error membawa `extensions.code`.

### Fase 4: Operasional (±7 jam) **[K5 sebagian]**
GAP #17, 18, 19, 21; D-009.
- Dockerfile API dan web; `docker compose up` menjalankan Postgres, RabbitMQ, API, web, seed; `GET /health` memeriksa DB dan broker.
- Pecah modul `letters`, `deadlines`, `dossier`, `health` (tanpa mengubah perilaku).
- *Boleh dipangkas*: Mailpit + email dev (±3 jam, hanya bila U11 masuk), Postman collection (±1 jam), ESLint API (±1,5 jam), `packages/shared` (D-007).
- **Selesai bila**: di mesin bersih `docker compose up` lalu membuka web dan masuk dengan akun demo berhasil dalam satu perintah dan README mencatat waktunya.

### Fase 5: Verifikasi hukum dan surat (±5 jam) **[K3]**
- Terapkan LEGAL_SOURCES ke seed `LegalRule`: akses, perbaikan, tarik persetujuan, tunda/batasi = VERIFIED dengan `sourceRef`; hapus, musnah, akhiri, keberatan otomatis = tanpa tenggat. Tidak ada aturan PP 33/2026 sebelum teks resmi diverifikasi dan PP berlaku.
- Template surat memuat tiga unsur PP Ps. 24 (identitas + lampiran bukti identitas oleh pengguna, hak dan kepentingan, uraian data).
- Disclaimer di semua tampilan tenggat; halaman Hak menampilkan status verifikasi dan sumber.
- Catatan "digantikan" di `legal-research.md`.
- **Selesai bila**: test memastikan tidak ada hitung mundur untuk aturan tanpa durasi atau belum VERIFIED; setiap aturan VERIFIED punya `sourceRef` (CHECK DB); tinjauan ahli hukum dijadwalkan (tidak harus selesai).

### Fase 6: Frontend untuk state baru + demo (±12 jam) **[K4]**
- Detail permintaan: lencana status baru, linimasa, hitung mundur dari `Deadline.state`, tombol sesuai `allowedTransitions`, eskalasi, catat tanggal terima.
- Banner "MODE DEMO" bila `timeScaled`.
- Dossier: halaman cetak + ekspor (JSON/HTML) dengan `contentSha256` dan catatan `DossierExport`.
- Notifikasi: daftar dengan cursor, penanda baca.
- *Boleh dipangkas*: PDF dossier (±3 jam), halaman statistik lanjutan untuk jurnalis (U14).
- **Selesai bila**: seluruh alur demo (bagian 3) dapat dijalankan dari UI tanpa membuka DB; semua teks Indonesia konsisten; layar 360 px dan 1280 px tidak patah; kontras dan fokus keyboard diperiksa.

### Fase 7: Demo, E2E, dan uji kekacauan (±6 jam) **[K1, K2]**
- Seed skenario demo (perusahaan demo `isDemo`, kanal, 2 permintaan pada tahap berbeda).
- Skrip demo bertahap dan skrip kekacauan (matikan/hidupkan RabbitMQ, restart API).
- E2E Playwright untuk jalur utama (kirim → OVERDUE → eskalasi → dossier) dengan `SCALE` tinggi.
- **Selesai bila**: E2E hijau di CI/lokal; skrip demo dijalankan dua kali berturut-turut dari `docker compose down -v` tanpa perbaikan manual.

### Fase 8: Dokumentasi dan penutup (±5 jam)
- README (cara jalan, mode demo, batasan), DECISIONS final, `known-limitations.md`, kebijakan takedown dan disclaimer publik, naskah pitch.
- Ganti dokumen lama dengan pointer ke SPEC/ARCHITECTURE/SCHEMA_DESIGN/LEGAL_SOURCES.
- **Selesai bila**: orang baru menjalankan sistem hanya dari README; semua penanda **VERIFY** yang belum terjawab tercantum di known-limitations.

Ringkasan jam: F1 16 + F2 8 + F3 7 + F4 7 + F5 5 + F6 12 + F7 6 + F8 5 = **66 jam**. Bila dipangkas semua yang boleh di fase 2-4 dan 6: ±47,5 jam (F2 -3,5, F3 -5,5, F4 -6,5, F6 -3; belum termasuk verifikasi email dan ModerationReport, yang bukan bagian dari estimasi 66 jam).

## 2. Urutan pemangkasan

| Urutan | Potongan | Hemat | Risiko bila dipangkas |
|---|---|---|---|
| 1 | Email + Mailpit (U11) | 3 j | Pengingat hanya in-app (sudah demikian); jangan menjanjikan email |
| 2 | Postman collection | 1 j | Penilai memakai GraphQL playground |
| 3 | ESLint API (D-009) | 1,5 j | "Lint lolos" tidak bermakna untuk API |
| 4 | `packages/shared` (D-007) | 1 j | Tidak ada |
| 5 | zod di web | 2 j | Validasi tetap ada di server |
| 6 | DataLoader | 2,5 j | N+1 di daftar; terlihat hanya dengan data besar |
| 7 | Cursor pagination selain `myRequests` | 3 j | Daftar publik tetap `take/skip` |
| 8 | argon2 | 1,5 j | bcrypt cost 12 masih layak, tapi menyimpang dari brief |
| 9 | Verifikasi email + reset sandi (U16) | 4 j | Risiko R1 tetap terbuka; harus tercatat di known-limitations |
| 10 | PDF dossier, statistik lanjutan | 3 j | Dossier HTML/JSON cukup |
| 11 | ModerationReport | 2 j | Tanpa jalur takedown di aplikasi; wajib ada kebijakan tertulis |

## 3. Alur demo (kriteria penerimaan akhir)

1. Cari perusahaan demo, lihat kanal dan status verifikasi.
2. Buat permintaan Akses, lihat surat (tiga unsur Ps. 24).
3. Catat pengiriman; hitung mundur "estimasi" muncul dengan banner MODE DEMO (`SCALE=1440`).
4. Pengingat "mendekat" tiba; **matikan RabbitMQ**, tunggu tenggat lewat, **hidupkan lagi**: status menjadi OVERDUE sekali, notifikasi sekali.
5. Buat permintaan Hapus: **tidak ada hitung mundur**, ada penjelasan "tidak ada tenggat di UU".
6. Eskalasi, unduh dossier, tunjukkan hash.

## 4. Pertanyaan terbuka (butuh keputusan Anda)

| # | Pertanyaan | Rekomendasi saya | Dampak bila tidak diputuskan |
|---|---|---|---|
| Q1 | **Setujui D-003?** Hapus status `REVIEWED` dan `COMPLETED` (data lama dimigrasi `REVIEWED→DRAFT`, `COMPLETED→CLOSED+RESOLVED`), dan hapus mutasi `reviewRequest`/`completeRequest` | Ya, ikut brief | Fase 1 tidak bisa mulai; mengubah enum DB dan UI |
| Q2 | **Bukti identitas** (PP Ps. 24(2) mewajibkan lampiran): aplikasi tidak menyimpan salinan KTP dan hanya mengingatkan pengguna melampirkannya sendiri saat mengirim, atau menyimpannya terenkripsi sebagai bukti? | Tidak menyimpan (privasi, enkripsi at-rest belum ada) | Menentukan risiko R1 dan R7 serta isi dossier |
| Q3 | **Interpretasi default** hitungan 3 x 24 jam: jam kalender, mulai dari `receivedAt` bila ada, kalau tidak dari `sentAt` (label "estimasi"), sampai ahli hukum meninjau. Boleh? | Ya, dengan disclaimer di setiap tampilan | Tanpa keputusan, hitung mundur tidak boleh ditampilkan (K3) |
| Q4 | **Email notifikasi** masuk MVP atau tetap in-app saja (stretch)? | Tetap in-app; email hanya bila sisa waktu | Memengaruhi Fase 4 (±3 jam) dan risiko deliverability R2 |
| Q5 | **Anggaran waktu dan lingkungan demo**: berapa jam tersisa/tenggat hackathon, dan apakah demo berjalan lokal atau di server publik (mode demo + banner di server publik)? | Lokal via `docker compose`, server publik hanya mode skala 1 | Menentukan seberapa banyak bagian 2 harus dipangkas dan apakah Dockerfile bersifat produksi |
