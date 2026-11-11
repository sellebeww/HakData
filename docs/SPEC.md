<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# SPEC: Hak Data

Status: **Diusulkan (Fase 0), menunggu persetujuan.** Dasar hukum: [LEGAL_SOURCES.md](LEGAL_SOURCES.md). Kondisi kode saat ini: [GAP_ANALYSIS.md](GAP_ANALYSIS.md). Spec ini menggantikan [product-requirements.md](product-requirements.md) setelah disetujui.

## 1. Tujuan

Membantu warga Indonesia menjalankan hak atas data pribadi (UU 27/2022) terhadap perusahaan, dengan tiga hal yang tidak diberikan email manual:

1. **Surat yang tepat** per hak, memuat unsur yang diminta peraturan (identitas, hak dan kepentingan, uraian data; PP 33/2026 Ps. 24).
2. **Catatan yang bisa dibuktikan** ("permohonan tercatat", UU Ps. 14): waktu kirim, waktu terima, bukti berhash, linimasa tak bisa diubah lewat aplikasi.
3. **Tenggat yang jujur**: hitung mundur hanya bila dasar hukumnya terverifikasi; selebihnya pengingat tindak lanjut yang diberi label "bukan tenggat hukum".

Hak Data **bukan** layanan hukum, **tidak** mengirim atas nama pengguna, dan **tidak** menilai perusahaan.

Ukuran keberhasilan demo (hackathon):
- Dari nol ke surat siap kirim untuk satu perusahaan dalam < 3 menit.
- Hitung mundur berjalan **live** di demo dengan `DEADLINE_TIME_SCALE` (72 jam menjadi beberapa menit): kirim, pengingat mendekat, lewat tenggat (OVERDUE), eskalasi, dossier.
- Matikan RabbitMQ saat demo, nyalakan lagi: tidak ada pengingat hilang atau ganda.

## 2. Persona

| Persona | Siapa | Kebutuhan | Yang diberikan | Batas |
|---|---|---|---|---|
| **Warga** (utama) | Pengguna layanan digital (fintech, e-commerce, telko) yang datanya bocor atau disalahgunakan | Tahu kanal yang benar, surat yang benar, kapan menagih, bukti untuk melapor | Direktori kanal, generator surat, linimasa, pengingat, dossier | Mengirim sendiri; paham bahwa ini bukan nasihat hukum |
| **Jurnalis / organisasi hak digital** | Meneliti pola kepatuhan, mendampingi korban | Bukti yang rapi, pola respons agregat, ekspor dossier | Dossier ekspor, statistik agregat dengan ambang k | Bertindak sebagai kuasa kolektif (PP Ps. 23) **di luar MVP**; tidak ada ranking perusahaan |
| **Mahasiswa / peneliti** | Belajar hukum PDP, tugas, penelitian | Penjelasan hak dalam bahasa awam, rujukan pasal, data agregat | Halaman Hak (arti, pasal, status verifikasi), statistik publik agregat | Data agregat saja, bukan data per pengguna |

## 3. User stories

Penanda: **MVP** = harus ada di demo; **S** = stretch. Kolom "Kini" membandingkan dengan MVP yang sudah ada.

| ID | Sebagai | Saya ingin | Agar | Prioritas | Kini |
|---|---|---|---|---|---|
| U1 | warga | mencari perusahaan dan melihat kanal privasinya beserta status verifikasi | saya mengirim ke alamat yang benar | MVP | Ada |
| U2 | warga | mengisi formulir pendek dan mendapat surat dengan unsur wajib (identitas, hak, uraian) | surat saya lengkap | MVP | Ada (6 hak), cek unsur Ps. 24 di Fase 5 |
| U3 | warga | mencatat kapan dan lewat mana saya mengirim | tenggat bisa dihitung dan dibuktikan | MVP | Ada |
| U4 | warga | melihat hitung mundur hanya bila dasarnya terverifikasi, dengan penjelasan "estimasi" | tidak tertipu angka palsu | MVP | Ada (derivasi), belum state tersimpan |
| U5 | warga | mendapat pengingat sebelum dan sesudah tenggat, tepat waktu walau aplikasi restart | saya tidak lupa menagih | MVP | Ada (polling 15 dtk), diganti wait-queue di Fase 1 |
| U6 | warga | status otomatis berubah ke OVERDUE saat tenggat lewat | saya tahu kapan boleh eskalasi | MVP | **Belum** |
| U7 | warga | mencatat balasan perusahaan (ACKNOWLEDGED, RESPONDED, ditolak, dll.) dan mengunggah bukti | linimasa lengkap | MVP | Ada (kategori balasan), state ACKNOWLEDGED belum |
| U8 | warga | menandai ESCALATED dan mengunduh dossier (linimasa, bukti ber-SHA-256, dasar hukum versi aturan) | saya siap melapor ke pihak berwenang | MVP | Ada (dossier), ESCALATED belum |
| U9 | warga | mengekspor dan menghapus semua data saya | saya mengendalikan data saya sendiri | MVP | Ada |
| U10 | warga | mengusulkan kanal yang benar untuk perusahaan | direktori makin akurat | S | Ada |
| U11 | warga | notifikasi lewat email, bukan hanya in-app | saya tahu tanpa membuka aplikasi | S | Belum (D: email sengaja belum) |
| U12 | moderator | meninjau usulan kanal dan memverifikasi | direktori tepercaya | MVP | Ada |
| U13 | admin | menerbitkan **versi baru** aturan hukum tanpa mengubah permintaan lama | PP 33/2026 bisa masuk saat berlaku | MVP | Ada |
| U14 | jurnalis/organisasi | statistik agregat (waktu respons, jenis respons) per industri/perusahaan dengan ambang k | saya melihat pola tanpa membuka individu | S | Ada; nilai k belum diverifikasi |
| U15 | mahasiswa | halaman penjelasan hak per pasal beserta status verifikasi | belajar dan merujuk | MVP | Ada |
| U16 | warga | verifikasi email dan reset kata sandi | akun tidak mudah diambil alih | S | Belum |

## 4. Scope

### MVP (harus selesai sebelum demo)
- State machine baru dan pemicu tenggat via wait-queue RabbitMQ + `DEADLINE_TIME_SCALE` ([ARCHITECTURE.md](ARCHITECTURE.md)).
- Idempotensi dan rekonsiliasi terbukti dengan test (konsumen ganda, broker mati, restart).
- Keamanan dasar: argon2, anti-IDOR dengan test negatif per resolver, validasi zod, batas upload.
- GraphQL bersih: enum terdaftar, cursor pagination, DataLoader, kode error seragam.
- Dossier ekspor, statistik agregat berambang k, panduan hak.
- `docker compose up` dari nol menjalankan seluruh sistem (belum ada Dockerfile API/web).

### Stretch (hanya bila waktu sisa)
- Email notifikasi + Mailpit di dev (U11), verifikasi email dan reset sandi (U16).
- Statistik lanjutan untuk jurnalis (U14), ekspor dossier PDF bertanda tangan hash.
- Postman collection, ESLint API, `packages/shared`.
- Integrasi aturan PP 33/2026 sebagai versi baru **setelah** teks resmi diverifikasi dan PP berlaku.

## 5. Non-goals

1. Mengirim email atau pesan **atas nama pengguna**.
2. Authorized agent / surat kuasa kolektif (PP Ps. 23) dan layanan pendampingan hukum.
3. Ranking, skor, atau label "perusahaan buruk". Statistik hanya agregat dan netral.
4. Gugatan dan ganti rugi (UU Ps. 12) dan portabilitas (Ps. 13): bukan surat permintaan.
5. Memindai inbox pengguna untuk membalas otomatis.
6. Menyimpan salinan KTP/bukti identitas di server (kecuali diputuskan lain, lihat pertanyaan terbuka Q2).
7. Menjadi saluran pengaduan resmi: Lembaga PDP belum ada ([LEGAL_SOURCES.md](LEGAL_SOURCES.md) bagian 2).
8. Nasihat hukum, termasuk menyatakan perusahaan "melanggar".

## 6. Risiko

| ID | Risiko | Dampak | Kemungkinan | Mitigasi | Sisa |
|---|---|---|---|---|---|
| R1 | **Verifikasi identitas.** Dua sisi: (a) pengendali wajib meminta bukti identitas pemohon (PP Ps. 24(2), 25); (b) akun kami belum memverifikasi email, jadi siapa pun bisa membuat akun dan permintaan atas nama orang lain | Permintaan ditolak karena identitas kurang; pengguna palsu; data identitas sensitif tersimpan | Tinggi | Surat memberi tahu pengguna melampirkan bukti identitas **sendiri** saat mengirim; kami tidak menyimpannya; verifikasi email (U16) naik jadi MVP-bila-sempat; pengguna menyatakan bahwa data yang dimintakan adalah miliknya | Penyalahgunaan akun palsu untuk meminta data orang lain tetap mungkin selama email belum terverifikasi |
| R2 | **Deliverability email.** Pengingat email ke pengguna masuk spam atau tidak terkirim; pengguna mengira tidak ada pengingat | Tenggat terlewat tanpa disadari | Tinggi bila email dipakai | MVP tetap **in-app**; email stretch dengan SPF/DKIM/DMARC dan domain pengirim khusus; in-app tetap sumber kebenaran; UI menandai "terakhir dicek" | Jangan menjanjikan email di demo kecuali stretch selesai |
| R3 | **Ketepatan teks hukum.** Salah kutip pasal, salah tenggat, atau memakai PP yang belum berlaku | Pengguna dirugikan; reputasi | Sedang | Aturan berversi di DB dengan status VERIFIED / NEEDS_CONFIRMATION / NOT_VERIFIED; tanpa tenggat bila belum VERIFIED; sumber dan tanggal akses di LEGAL_SOURCES; tinjauan ahli sebelum publik; disclaimer di setiap tenggat | Teks PP masih sekunder; "jam" kalender vs hari kerja belum pasti |
| R4 | **Pencemaran nama / tuduhan terhadap perusahaan.** Direktori, usulan komunitas, dan statistik bisa dibaca sebagai tudingan; dossier bisa dipakai menyebarkan klaim | Gugatan balik terhadap pengguna atau proyek (ketentuan pencemaran nama di UU ITE, **VERIFY** pasalnya) | Sedang | Hanya fakta netral (status kanal, kategori respons); tidak ada teks bebas publik; bukti berlabel USER_UPLOADED (bukan "terbukti"); statistik hanya agregat dengan ambang k; moderasi + prosedur takedown; tidak ada ranking; dossier hanya untuk pemilik | Perlu kebijakan takedown tertulis dan tinjauan hukum |
| R5 | **Tenggat palsu.** Awal hitung salah (kirim vs terima vs terverifikasi) | Pengguna menuduh terlambat padahal belum | Sedang | `receivedAt` dari bukti; label "estimasi"; tampil batas bawah dan catatan verifikasi (LEGAL_SOURCES L4) | |
| R6 | **Pengingat hilang atau ganda** | Kepercayaan, demo gagal | Sedang | Outbox + konsumen idempoten + rekonsiliasi ([ARCHITECTURE.md](ARCHITECTURE.md)) | |
| R7 | **Kebocoran data bukti** | Kerugian privasi besar | Rendah-sedang | Anti-IDOR, unduh hanya pemilik, tanpa PII di log, tanpa enkripsi at-rest (belum) | Enkripsi at-rest belum ada |
| R8 | **Waktu hackathon mepet** | Demo lemah | Tinggi | [ROADMAP.md](ROADMAP.md): daftar yang tidak boleh dipangkas | |
