<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# Pengujian
Hasil nyata dari eksekusi terakhir (11 Nov 2026, build produksi untuk web):
| Pengujian | Hasil |
|---|---|
| Typecheck web (tsc) | lolos |
| Typecheck API (tsc) | lolos |
| Lint web (next lint) | lolos, 0 peringatan. **API tidak punya ESLint**: skrip `lint` hanya tsc |
| Unit (Jest) | 13/13 |
| Integration (Jest, Postgres+RabbitMQ nyata) | 17/17 |
| E2E (Playwright, Chromium, build produksi) | 5/5, tanpa error console |
| Build produksi | web (next build) dan API (nest build) berhasil |
Cakupan integration: alur 14 langkah di sisi API, deadline 72 jam, versi aturan, pengingat via RabbitMQ + idempoten, upload valid/palsu, IDOR, peran, mass assignment, brute force, SQLi dasar, batas kompleksitas, cookie httpOnly, moderasi, hapus akun.
Tidak diuji: broker mati saat berjalan, consumer crash, beban, aksesibilitas otomatis (axe), browser selain Chromium, kontras warna terukur, CSRF pada upload, ekspor dossier isi, tablet.
Catatan: uji integrasi berbagi database dev dan menulis data uji (pengguna acak, versi aturan CORRECTION).
