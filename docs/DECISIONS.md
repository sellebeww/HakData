<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# Catatan Keputusan

Format: konteks, keputusan, status. **Diusulkan** = menunggu persetujuan pemilik proyek.

## D-001 (Disetujui, 11 Nov 2026): Fase 0 = audit selisih, bukan refactor
Repo sudah berisi MVP yang lulus 13 unit + 17 integration test, tetapi berbeda dari brief (lihat [GAP_ANALYSIS.md](GAP_ANALYSIS.md)). Pemilik memilih audit dulu. Tidak ada kode fitur diubah di Fase 0.

## D-002 (Fase 0): Baseline git
`git init` dengan cabang `main` dan satu commit baseline berisi kondisi MVP apa adanya. `.gitignore` diperluas (`dist`, `storage`, `test-results`, `playwright-report`, `*.tsbuildinfo`, `.DS_Store`) supaya berkas bukti unggahan dan artefak build tidak ikut tercatat. `.env` tidak pernah dicommit.

## D-003 (Diusulkan): Pemetaan state machine
Brief: `DRAFT → SENT → ACKNOWLEDGED → RESPONDED → CLOSED`, cabang `OVERDUE → ESCALATED`. MVP: `DRAFT → REVIEWED → SENT → RESPONDED → COMPLETED → CLOSED`.
Usulan: ikuti brief; `REVIEWED` dan `COMPLETED` dihapus (ditampung oleh `DRAFT` dan `CLOSED` dengan alasan penutupan). Migrasi data: `REVIEWED→DRAFT`, `COMPLETED→CLOSED`. Perlu persetujuan karena mengubah enum DB dan UI.

## D-004 (Diusulkan): 3x24 jam sebagai default vs aturan berversi
Brief menetapkan default 3x24 jam. MVP hanya memberi hitung mundur pada hak yang aturannya VERIFIED dan sengaja **tidak** memberi hitung mundur pada Hapus dan Keberatan Otomatis ([legal-research.md](legal-research.md)). Aturan kerja no. 3 (jangan mengarang fakta hukum) mendukung sikap MVP.
Usulan: pertahankan aturan berversi di DB sebagai sumber nilai dan dasar hukum; 3x24 jam hanya nilai awal pada hak yang terverifikasi. Hak tanpa dasar terverifikasi tetap tanpa tenggat otomatis.

## D-005 (Diusulkan): Outbox dipertahankan, wait-queue ditambahkan
Outbox transaksional sudah menutup celah antara commit DB dan publish. Usulan: pertahankan outbox, lalu ganti pemicu waktu dari polling 15 detik menjadi topologi wait-queue per delay tetap → DLX → due-queue; polling DB tinggal sebagai cron rekonsiliasi (jaring pengaman), sesuai brief. `DEADLINE_TIME_SCALE` dibaca di satu tempat (fungsi penghitung waktu).

## D-006 (Diusulkan): argon2 dengan rehash saat login
Ganti `bcryptjs` ke `argon2`. Hash bcrypt lama tetap diverifikasi sekali, lalu diganti hash argon2 saat login berhasil (tanpa reset massal). Hanya akun demo yang ada saat ini, sehingga risiko migrasi rendah.

## D-007 (Diusulkan): `packages/shared` ditunda
Brief menyebut "bila perlu". Belum ada tipe yang benar-benar dipakai bersama API dan web (web memakai GraphQL langsung). Dibuat hanya jika Fase 1 (enum status) membutuhkannya.

## D-008 (Diusulkan): `legal-research.md` tetap, bukan ganti nama
Isinya sudah memenuhi fungsi `LEGAL_SOURCES.md` (URL, tanggal akses, penanda belum-terverifikasi) dan dirujuk dari README dan beberapa dokumen. Usulan: tambahkan satu baris di `docs/` yang menyebut kesetaraannya, tanpa mengganti nama berkas.

## D-009 (Diusulkan): Lint API
Skrip `lint` API saat ini hanya `tsc --noEmit`. Usulan: tambahkan ESLint (typescript-eslint) di Fase 4 agar "lint lolos" pada Definition of Done bermakna untuk API.
