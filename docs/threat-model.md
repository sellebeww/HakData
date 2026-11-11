<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# Threat Model (STRIDE)
| # | Ancaman | Dampak | Kemungkinan | Mitigasi | Status |
|---|---|---|---|---|---|
| S1 | Brute force/credential stuffing login | Ambil alih akun | Sedang | Kunci 5 gagal/10 mnt per email, bcrypt 12, rate limit global, waktu respons seragam | Terimplementasi; penguncian in-memory (tidak lintas instance), tanpa rate limit per IP |
| S2 | Pencurian sesi | Akses data | Sedang | Cookie httpOnly, SameSite=Lax, secure di prod, JWT 7 hari | Terimplementasi; **belum ada pencabutan token** selain hapus akun |
| T1 | Mass assignment | Ubah status/user | Sedang | Hanya kunci field yang dikenal diterima; skema GraphQL | Teruji |
| T2 | Manipulasi dossier/bukti | Bukti diragukan | Sedang | Timeline append-only lewat aplikasi, sha256 berkas, label USER_UPLOADED | Parsial: DB admin tetap bisa mengubah; tanpa hash-chain |
| R1 | Penyangkalan aksi admin | Sengketa | Rendah | AuditLog untuk aksi admin/moderator | Terimplementasi; log bukan WORM |
| I1 | IDOR permintaan/bukti | Kebocoran data | Tinggi | Pemeriksaan kepemilikan di service, 404 | Teruji |
| I2 | Upload berbahaya | XSS/malware | Sedang | Magic bytes, whitelist, nama acak, di luar direktori publik, attachment+nosniff | Terimplementasi; **tanpa antivirus** |
| I3 | Kebocoran lewat error | Info internal | Sedang | Error internal digeneralisasi | Teruji |
| I4 | Statistik membongkar identitas | Privasi | Rendah | Agregasi, ambang 10 sampel, tanpa identitas | Terimplementasi |
| D1 | Kueri GraphQL berat | DoS | Sedang | Depth 8, complexity 300, throttler | Teruji (complexity) |
| D2 | Banjir upload | Disk penuh | Sedang | 10 MB, 1 berkas/permintaan HTTP | Parsial: tanpa kuota per pengguna |
| E1 | Eskalasi peran | Takeover admin | Rendah | Guard backend dan peran dimuat dari DB tiap request; moderator tidak bisa VERIFIED/aturan/audit | Teruji |
| E2 | Injeksi SQL | Data | Rendah | Prisma terparameter; raw query hanya konstan | Teruji (payload dasar) |
| X1 | CSRF | Aksi tak sah | Sedang | SameSite=Lax, Apollo csrfPrevention, JSON-only | Terimplementasi; endpoint upload mengandalkan SameSite saja |
Belum ada: enkripsi at-rest, rotasi kunci, verifikasi email, reset kata sandi, 2FA, pemindaian dependensi otomatis.
