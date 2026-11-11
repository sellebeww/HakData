<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# Keterbatasan yang diketahui
**Hukum:** belum ditinjau ahli hukum; kutipan pasal dari transkripsi Wikisource, belum dibandingkan dengan PDF BPK; teks resmi PP 33/2026 belum dibaca; "jam" ditafsirkan jam kalender; awal hitung memakai waktu kirim bila waktu terima tidak dicatat (estimasi).
**Produk:** tanpa email notifikasi, verifikasi email, reset kata sandi; tidak ada kanal pengaduan resmi (Lembaga PDP belum terbentuk); template tidak dapat diedit via UI (ubah lewat database/seed); ModerationReport, laporan pengguna, dan alias perusahaan tidak ada; seluruh data direktori berlabel DEMO, tidak ada perusahaan nyata; tidak ada pengguna nyata yang menguji; statistik demo disimulasikan dari seed.
**Teknis:** penguncian login in-memory; tanpa antivirus berkas; tanpa enkripsi at-rest dan CSRF token khusus untuk upload; JWT tidak dapat dicabut; GraphQL enum berupa String; modul API tanpa ESLint; web client mem-fetch langsung (tanpa cache); aksesibilitas baru dasar (label, fokus, dialog native, reduced motion), belum diaudit WCAG formal.
**Pengujian:** lihat testing-strategy untuk yang tidak diuji.
