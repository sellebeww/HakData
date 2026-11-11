<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# Riset Hukum — Hak Data

> **Peringatan:** dokumen ini disusun oleh pengembang perangkat lunak (dibantu AI), **bukan advokat**. Seluruh interpretasi operasional di bawah wajib ditinjau ahli hukum sebelum produk dipublikasikan.
> Tanggal akses semua sumber: **11 November 2026**.

## 1. Daftar peraturan dan status

| Peraturan | Status (per 11 Nov 2026) | Sumber | Keterangan |
|---|---|---|---|
| UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (LN 2022 No. 175) | Berlaku. Masa penyesuaian 2 tahun sejak diundangkan (Pasal 74) sudah lewat | Transkripsi teks: [Wikisource](https://id.wikisource.org/wiki/Undang-Undang_Republik_Indonesia_Nomor_27_Tahun_2022). Naskah resmi: [peraturan.bpk.go.id/Details/229798](https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022.) | Bunyi pasal di dokumen ini dikutip dari transkripsi. **Belum dibandingkan baris per baris dengan PDF resmi BPK.** |
| PP No. 33 Tahun 2026 tentang Peraturan Pelaksanaan UU PDP (225 pasal) | Diundangkan 16 Juli 2026. **Berlaku mulai 16 Januari 2027 (Pasal 225), jadi belum berlaku hari ini** | Hanya sumber sekunder: [SIP Law Firm, 23 Okt 2026](https://siplawfirm.id/resources/pp-33-2026-pelindungan-data-pribadi); [Bisnis.com 1 Sep 2026](https://teknologi.bisnis.com/read/20260901/84/2000553/penerapan-aturan-pp-pelindungan-data-pribadi-butuh-dukungan-otoritas-independen) | **Teks resmi PP belum saya baca.** Semua klaim tentang isinya berstatus BELUM TERVERIFIKASI |
| Putusan MK No. 151/PUU-XXII/2024 (tafsir Pasal 53 ayat 1 "dan" menjadi "dan/atau") | Berlaku | Dikutip dari artikel SIP Law Firm di atas | Tidak memengaruhi hak subjek data |
| Perpres Lembaga PDP | **Belum terbit/terbentuk** per Sep 2026 ([Bisnis.com 13 Sep 2026](https://teknologi.bisnis.com/read/20260913/84/2003698/pembentukan-badan-pdp-dipercepat-implementasi-uu-pdp-dinilai-belum-efektif)) | sekunder | Konsekuensi: **belum ada kanal pengaduan lembaga resmi yang dapat kami rujuk.** Fitur eskalasi tidak boleh menyebut lembaga PDP sebagai tujuan pengaduan |

## 2. Dasar hukum tiap hak (dikutip dari UU 27/2022)

| Hak | Pasal | Inti | Cara pengajuan |
|---|---|---|---|
| Informasi tentang identitas, dasar hukum, tujuan, akuntabilitas peminta data | 5 | Hak mendapat informasi | Pasal 14 hanya menyebut Pasal 6–11, jadi Pasal 5 tidak wajib lewat permohonan tercatat |
| Melengkapi, memperbarui, memperbaiki data | 6 | | Permohonan tercatat, elektronik/nonelektronik (Pasal 14) |
| Akses dan salinan data | 7 | | idem |
| Mengakhiri pemrosesan, menghapus, memusnahkan | 8 | "sesuai ketentuan peraturan perundang-undangan" | idem |
| Menarik persetujuan | 9 | | idem |
| Keberatan atas keputusan murni otomatis (termasuk pemrofilan) yang berakibat hukum/signifikan | 10 | Tata cara akan diatur PP (Pasal 10 ayat 2) | idem |
| Menunda atau membatasi pemrosesan secara proporsional | 11 | | idem |
| Menggugat dan menerima ganti rugi | 12 | Tata cara diatur PP | **Jalur hukum, bukan surat permintaan. Di luar cakupan generator** |
| Portabilitas data | 13 | Format lazim/terbaca sistem elektronik | Di luar MVP |

**Temuan penting dari Pasal 14:** permohonan harus "**tercatat**". Ini justru dasar kuat untuk dossier bukti pengiriman Hak Data.

## 3. Tenggat waktu (hasil verifikasi)

| Jenis Hak | Dasar Hukum | Kewajiban Pengendali | Tenggat | Awal Penghitungan | Pengecualian | Status Verifikasi |
|---|---|---|---|---|---|---|
| Akses | Ps. 32(1)(2) | Memberi akses ke data yang diproses beserta rekam jejak pemrosesan | **3 x 24 jam** | "terhitung sejak Pengendali menerima permintaan akses" | Ps. 33 (wajib menolak bila membahayakan keselamatan/kesehatan, membuka data orang lain, bertentangan dengan pertahanan keamanan nasional); Ps. 50 | VERIFIED (teks UU, transkripsi) |
| Perbaikan/pembaruan | Ps. 30(1)(2) | Memperbarui/memperbaiki dan **memberitahukan hasilnya** ke subjek | **3 x 24 jam** | sejak menerima permintaan | Ps. 50 | VERIFIED |
| Tarik persetujuan | Ps. 40(1)(2) | Menghentikan pemrosesan | **3 x 24 jam** | sejak menerima permintaan penarikan | Ps. 50 tidak menyebut Ps. 40 | VERIFIED |
| Tunda/batasi pemrosesan | Ps. 41(1)-(3) | Menunda/membatasi sebagian atau seluruhnya, lalu memberitahu subjek | **3 x 24 jam** | sejak menerima permintaan | Ps. 41(2): ketentuan perundang-undangan melarang; membahayakan keselamatan pihak lain; terikat perjanjian tertulis yang tidak memungkinkan | VERIFIED |
| Hapus data | Ps. 43(1) c, Ps. 8 | Wajib menghapus bila ada permintaan subjek; wajib memberitahu (Ps. 45) | **Tidak ada angka tenggat di UU** | tidak ditentukan | Ps. 43(2) dan Ps. 50 | **BELUM TERVERIFIKASI** (tenggat) |
| Musnahkan data | Ps. 44(1) b | idem, dan Ps. 44(1)(c) "tidak berkaitan dengan penyelesaian proses hukum" | **Tidak ada angka tenggat di UU** | tidak ditentukan | Ps. 44(2), Ps. 50 | **BELUM TERVERIFIKASI** |
| Akhiri pemrosesan | Ps. 42(1) c | Wajib mengakhiri bila ada permintaan subjek | **Tidak ada angka tenggat di UU** | tidak ditentukan | Ps. 50 | **BELUM TERVERIFIKASI** |
| Keberatan keputusan otomatis | Ps. 10 | Tata cara menunggu PP | Tidak diketahui | Tidak diketahui | | **BELUM TERVERIFIKASI** |
| Informasi (Ps. 5) | Ps. 5 | | Tidak ada | | | Tidak ada tenggat |
| Pemberitahuan kegagalan pelindungan data | Ps. 46 | Pemberitahuan tertulis ke subjek dan lembaga | 3 x 24 jam, **tetapi kewajiban pengendali tentang insiden, bukan hak yang diajukan pengguna** | | | Di luar cakupan deadline engine |

### Kesimpulan koreksi terhadap konsep awal
1. "3 x 24 jam untuk semua permintaan" **salah**. Hanya akses, perbaikan, tarik persetujuan, dan tunda/batasi yang punya tenggat 3 x 24 jam di UU. Penghapusan, pemusnahan, pengakhiran, dan keberatan otomatis tidak.
2. Penghitungan dimulai saat **pengendali menerima** permintaan, bukan saat pengguna mengirim. Sistem hanya tahu waktu kirim, maka hasilnya selalu **estimasi** dan pengguna dapat memasukkan waktu terima dari bukti (balasan otomatis, tanda terima).
3. UU memakai satuan "jam" (3 x 24 jam), bukan "hari kerja". Interpretasi operasional kami: **jam kalender** (72 jam penuh, termasuk akhir pekan). **Perlu konfirmasi ahli hukum.**
4. Pengecualian Ps. 50 (pertahanan, penegakan hukum, kepentingan umum penyelenggaraan negara, pengawasan sektor keuangan) berlaku untuk Ps. 30, 32, 36, 42, 43(1)a-c, 44(1)b, 45, 46(1)a. Perusahaan swasta pada umumnya tidak berada di cakupan ini, tetapi bank/sektor jasa keuangan dapat menyatakannya. Aplikasi menampilkannya sebagai catatan.

### Interpretasi operasional di aplikasi
- Aturan tenggat disimpan di tabel `LegalRule` dengan versi. Aturan yang BELUM TERVERIFIKASI **tidak menghasilkan hitung mundur**; status permintaan menjadi `RULE_NOT_VERIFIED` dan pengguna hanya mendapat **pengingat tindak lanjut pribadi** (default 14 hari, dapat diubah, ditandai jelas "bukan tenggat hukum").
- Saat PP 33/2026 berlaku (16 Jan 2027) dan teks resminya sudah diverifikasi, admin menambah **versi baru** aturan. Permintaan lama tetap memakai versi lama.

## 4. Hal yang perlu tinjauan ahli hukum
1. Bandingkan kutipan pasal dengan PDF resmi BPK/JDIH.
2. Baca teks resmi PP 33/2026: apakah mengubah tenggat, awal hitung (setelah verifikasi identitas?), atau menambah tenggat untuk hapus/musnah/keberatan. Sumber sekunder menyebut hitungan salinan data "baru mulai setelah permintaan diterima dan terverifikasi" dan pengendali wajib memverifikasi identitas pemohon. **Belum diverifikasi.**
3. Apakah "jam" = jam kalender.
4. Template surat dan kalimat dasar hukum.
5. Kanal pengaduan resmi setelah Lembaga PDP terbentuk.
6. Apakah Hak Data sendiri menjadi pengendali/prosesor data pribadi pengguna dan kewajiban turunannya (kebijakan privasi, retensi).
