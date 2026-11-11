// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// Konten statis: tentang, cara kerja, FAQ, disclaimer, kontak.
const FAQ: [string, string][] = [
  ["Apakah Hak Data memaksa perusahaan menjawab?", "Tidak. Hak Data bukan lembaga regulator atau pengadilan dan tidak punya kewenangan memaksa. Kami membantu menyusun, mencatat, dan memantau permintaan Anda."],
  ["Apakah Hak Data mengirim email atas nama saya?", "Tidak. Anda mengirim sendiri lewat kanal pilihan Anda, lalu mencatat pengirimannya di sini. Kami tidak mengirim email otomatis tanpa persetujuan Anda."],
  ["Apakah semua permintaan punya tenggat 3 x 24 jam?", "Tidak. Hanya akses, perbaikan, tarik persetujuan, dan tunda/batasi pemrosesan yang memiliki angka tersebut di UU 27/2022. Hapus data dan keberatan keputusan otomatis tidak memiliki angka tenggat terverifikasi, jadi kami tidak menampilkan hitung mundur untuknya."],
  ["Apakah data saya aman?", "Kami hanya meminta data seperlunya (tanpa KTP). Bukti disimpan di luar direktori publik dan hanya dapat diunduh pemilik. Anda dapat mengekspor atau menghapus akun kapan saja. Detail ada di halaman Profil."],
  ["Apakah bukti yang saya unggah menjadi bukti sah?", "Tidak otomatis. Unggahan dicatat sebagai \"dicatat pengguna\" dan belum diverifikasi independen. Kami menyimpan sidik jari (SHA-256) berkas agar perubahan dapat terdeteksi."],
  ["Mengapa belum ada tombol lapor ke lembaga PDP?", "Karena lembaga PDP belum terbentuk per akhir 2026 dan kami tidak mengarang kanal pengaduan. Fitur ini akan ditambahkan saat kanal resmi tersedia."],
];
export default function About() {
  return (
    <div className="page">
      <h1>Tentang Hak Data</h1>
      <p className="sub">Hak Data mengubah proses menagih hak atas data pribadi yang tersebar dan membingungkan menjadi alur yang berurutan: pilih perusahaan, pilih hak, surat siap kirim, lacak, dan simpan bukti.</p>
      <section className="panel"><h2>Disclaimer hukum</h2>
        <ul><li>Informasi di platform bukan nasihat hukum profesional.</li><li>Platform membantu administrasi dan dokumentasi, bukan pengadilan, regulator, atau firma hukum.</li>
          <li>Hasil permintaan bergantung pada kondisi, ketentuan hukum, dan respons pengendali data.</li><li>Pelacak tenggat adalah alat bantu berdasarkan aturan yang telah diverifikasi pengembang, belum oleh ahli hukum.</li><li>Informasi dapat diperbarui ketika regulasi berubah (mis. PP 33/2026 berlaku 16 Januari 2027).</li></ul></section>
      <h2 style={{ marginTop: 32 }}>Pertanyaan umum</h2>
      <div className="list">{FAQ.map(([q, a]) => <details key={q} className="panel"><summary><strong>{q}</strong></summary><p>{a}</p></details>)}</div>
      <section className="panel" style={{ marginTop: 24 }}><h2>Kontak</h2><p>Ini proyek MVP/demo, belum ada kanal dukungan publik. Kanal kontak akan dicantumkan saat tersedia.</p></section>
    </div>
  );
}
