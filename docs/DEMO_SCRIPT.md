<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# Skrip demo 3 menit (untuk juri)

**Inti yang harus tertangkap juri:** warga bisa menagih hak datanya ke perusahaan dengan surat yang benar, dan **sistem yang mengingat tenggatnya**. Tenggat hukum 72 jam dipercepat dengan `DEADLINE_TIME_SCALE` agar terlihat dalam hitungan detik, lewat mesin yang sama persis dengan produksi.

## Persiapan (sebelum juri datang, ±3 menit)

```bash
docker compose up --build        # sekali; berikutnya cukup `docker compose up`
```

Compose sudah mengaktifkan mode demo: `DEMO_MODE=true` dan `DEADLINE_TIME_SCALE=8640`. Pada skala ini **tenggat 72 jam menjadi 30 detik** (diukur: notifikasi "menjelang tenggat" di ±20 dtk, status OVERDUE di ±31 dtk).

Buka 3 tab:

| Tab | URL | Untuk |
|---|---|---|
| 1. Aplikasi | http://localhost:3000 → **Masuk** sebagai `user@hakdata.demo` / `DemoPass!2026` | Alur utama |
| 2. Mailpit | http://localhost:8025 | Bukti surat benar-benar terkirim |
| 3. RabbitMQ | http://localhost:15673 (`hakdata` / `hakdata_dev`) → Queues | Tangga tunda TTL+DLX |

Perusahaan demo (fiktif, domain `.example`) punya perilaku simulasi:

| Perusahaan | Perilaku | Dipakai untuk |
|---|---|---|
| DEMO · Seluler Contoh | **diam** | jalur OVERDUE → eskalasi (inti demo) |
| DEMO · Toko Contoh | membalas tepat waktu (±12 dtk) | statistik, cadangan |
| DEMO · Dompet Contoh | membalas terlambat (±39 dtk) | pertanyaan juri tentang keterlambatan |

Ulang dari bersih antar-latihan: `docker compose down -v && docker compose up`.

## Skrip

| Waktu | Layar | Ucapkan (kira-kira) |
|---|---|---|
| **0:00–0:20** | Tab 1, beranda | "UU PDP memberi warga hak meminta akses, koreksi, dan penghapusan data. Masalahnya: siapa yang dihubungi, surat apa, dan siapa yang ingat tenggat 72 jamnya? Hak Data mengerjakan ketiganya." |
| **0:20–0:40** | **Direktori** → cari "toko" → buka **DEMO · Toko Contoh** | "Kanal privasi punya status verifikasi dan sumber. Statistik respons hanya tampil kalau datanya dari minimal 10 pengguna berbeda, dan hanya dari surat yang dikirim lewat platform, jadi tidak bisa direkayasa satu akun." |
| **0:40–1:20** | Direktori → **DEMO · Seluler Contoh** → **Ajukan permintaan data** → *Akses & salinan data* → isi nama dan akun → **Buat draf surat** | "Surat disusun dari template berdasarkan pasal yang sudah diverifikasi, ada disclaimer, dan bisa disunting." Lalu setujui → **Kirim lewat email sekarang**. **Mulai hitung dalam hati: OVERDUE dalam 30 detik.** |
| **1:20–1:35** | Tab 2 (Mailpit) | "Surat benar-benar terkirim. Message-ID dan SHA-256 isinya dicatat sebagai bukti kirim. Klik dua kali pun tetap satu email, karena barisnya dikunci." |
| **1:35–2:00** | Tab 3 (RabbitMQ) → queue `hd.wait.10s` / `hd.wait.1s` | "Inilah keputusan desain utamanya. Pengingat tidak memakai cron yang memindai tabel. Pesan berisi ID saja melompat di **tangga antrean TTL tetap** (7 hari, 1 hari, 1 jam, … 1 detik) lalu jatuh lewat dead-letter exchange tepat waktu. Database tetap sumber kebenaran: kalau broker mati, outbox dan rekonsiliator memulihkannya." |
| **2:00–2:25** | Tab 1 → muat ulang detail permintaan | Status **Lewat estimasi tenggat** dan lonceng notifikasi bertambah. "Ini estimasi dari aturan terverifikasi, bukan putusan pelanggaran. Eskalasi tetap keputusan pengguna." Klik **Eskalasi** → konfirmasi. |
| **2:25–2:50** | **Buka dossier** | "Dossier berisi kronologi append-only (UPDATE/DELETE ditolak oleh trigger di database, bukan hanya oleh aplikasi), bukti kirim, dan tenggat. **Unduh ekspor** menghasilkan berkas yang siap dilampirkan saat melapor." |
| **2:50–3:00** | (tetap di dossier) | "Hak Data bukan nasihat hukum. Riset hukum belum ditinjau ahli. Yang kami jamin: tenggat hanya dihitung dari aturan terverifikasi, dan setiap klaim keamanan ada test-nya, di docs/SECURITY.md." |

## Bila ditanya

| Pertanyaan | Jawaban singkat + bukti |
|---|---|
| "Kenapa tidak cron saja?" | Cron memindai seluruh tabel tiap menit dan presisinya sebesar intervalnya. TTL per-queue tetap (bukan TTL per pesan) menghindari head-of-line blocking; skala dari 14 hari sampai 1 detik cukup dengan 7 antrean. `docs/ARCHITECTURE.md` §4. |
| "Kalau RabbitMQ mati?" | Pesan tertahan di tabel outbox; rekonsiliator per batch menandai OVERDUE langsung dari DB. Test: `deadlines.int.ts` › "queue di-purge …". |
| "Kalau pesannya dobel?" | Klaim `firedAt is null` dalam transaksi + `dedupeKey` unik → tepat satu efek. Test: "pesan yang sama berkali-kali …". |
| "Bagaimana dengan perusahaan yang membalas terlambat?" | Kirim ke **DEMO · Dompet Contoh**; dalam ±40 detik dossier menunjukkan "terlambat X" dihitung otomatis. |
| "Data pengguna aman?" | Cookie httpOnly, argon2id, IDOR = 404, hapus akun menghapus linimasa. Tabel lengkap: `docs/SECURITY.md`. |
| "Kenapa 72 jam?" | UU 27/2022 Pasal 32 ayat (2) untuk akses; hak tanpa angka di UU (mis. penghapusan) sengaja **tanpa** hitung mundur. `docs/legal-research.md`. |

## Rencana cadangan

| Masalah | Tindakan |
|---|---|
| Status belum berubah setelah 30 detik | Muat ulang halaman (UI tidak polling). Masih belum: cek `docker compose logs api` |
| Laptop lambat saat build | Build sehari sebelumnya; saat demo cukup `docker compose up` |
| Port 3000 terpakai | `WEB_PORT=3100 docker compose up` |
| Ingin waktu lebih longgar | `DEMO_TIME_SCALE=1440 docker compose up` (72 jam = 3 menit) |
