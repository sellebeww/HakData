<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# Product Requirements (MVP)
## Value proposition
Problem: hak data sulit dijalankan. Target: pengguna layanan digital Indonesia. Alternatif sekarang: email manual tanpa catatan. Solusi: surat per hak + pencatatan + tenggat berdasar aturan + dossier. Pembeda: tenggat yang jujur dan dossier "tercatat".
## Prioritas
| Prioritas | Fitur | Status |
|---|---|---|
| P0 | Direktori kanal, generator surat 6 hak, request management (state machine), deadline engine berversi, dossier, bukti, respons, auth + RBAC | Selesai & teruji |
| P1 | Pengingat (outbox+RabbitMQ), notifikasi in-app, usulan kanal + moderasi, statistik agregat, aturan hukum dikelola admin, audit log, ekspor/hapus akun | Selesai & teruji |
| P2 | Manajemen template via UI admin, email notifikasi, laporan pengguna (ModerationReport), verifikasi email, reset kata sandi | **Belum dibuat** |
| Out of scope | Mengirim email atas nama pengguna, authorized agent, pemindaian inbox, ranking perusahaan, gugatan (Pasal 12), portabilitas (Pasal 13) | Sengaja tidak |
## Aturan bisnis kunci
Permintaan terkirim tidak dapat diedit; countdown hanya dari aturan VERIFIED; mengubah isian membatalkan peninjauan; "selesai" adalah penilaian pengguna; bukti = USER_UPLOADED, bukan sah otomatis; statistik di bawah 10 sampel disembunyikan.
## Acceptance
Seluruh alur 14 langkah diuji pada E2E dan integration test (lihat testing-strategy).
