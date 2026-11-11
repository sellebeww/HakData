// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { DeadlineDemo } from "@/components/DeadlineDemo";

const rights = [
  ["Akses & salinan", "Minta tahu data apa yang dipegang dan dapatkan salinannya."],
  ["Perbaikan", "Lengkapi, perbarui, atau koreksi data yang keliru."],
  ["Penghapusan", "Minta data dihapus atau dimusnahkan sesuai ketentuan."],
  ["Tarik persetujuan", "Cabut persetujuan yang pernah kamu berikan."],
  ["Batasi pemrosesan", "Tunda atau batasi cara datamu diolah."],
  ["Keberatan otomatis", "Ajukan keberatan atas keputusan yang murni otomatis."],
];
const steps = [
  ["Pilih perusahaan", "Lihat kanal privasi resmi beserta status verifikasinya."],
  ["Pilih hak", "Kami jelaskan artinya dengan bahasa sehari-hari."],
  ["Surat siap kirim", "Draf formal dan sopan, kamu tinjau dan edit sendiri."],
  ["Lacak & simpan bukti", "Tenggat, balasan, dan bukti tersusun di satu dossier."],
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <span className="chip">UU No. 27 Tahun 2022 · Pelindungan Data Pribadi</span>
        <h1>
          Kamu berhak tahu
          <br />
          datamu dipakai <span className="grad">untuk apa.</span>
        </h1>
        <p className="lead">
          Biar sistem yang menagih jawabannya. Susun permintaan, kirim, lacak tenggat, dan simpan semua bukti dalam satu tempat.
        </p>
        <div className="cta" id="mulai">
          <Link className="btn btn-primary" href="/daftar">
            Mulai permintaan
          </Link>
          <Link className="btn btn-ghost" href="/perusahaan">
            Cari perusahaan
          </Link>
        </div>
        <div className="keyhole" aria-hidden>
          <span />
        </div>
      </section>

      <section id="cara" className="sec">
        <Reveal>
          <h2>
            Dari bingung jadi <span className="grad">berurutan</span>
          </h2>
        </Reveal>
        <ol className="steps">
          {steps.map(([t, d], i) => (
            <Reveal as="li" key={t} delay={i * 90}>
              <span className="num">{i + 1}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section id="hak" className="sec">
        <Reveal>
          <h2>
            Enam hak, <span className="grad">enam jenis surat</span>
          </h2>
          <p className="sub">Setiap hak punya dasar hukum dan template sendiri, bukan satu surat untuk semuanya.</p>
        </Reveal>
        <ul className="rights">
          {rights.map(([t, d], i) => (
            <Reveal as="li" key={t} delay={i * 70}>
              <h3>{t}</h3>
              <p>{d}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      <section id="tenggat" className="sec split">
        <Reveal>
          <h2>
            Tenggat yang <span className="grad">ada dasarnya</span>
          </h2>
          <p className="sub">
            Tidak semua permintaan punya batas waktu yang sama. Kami hanya menampilkan hitung mundur dari aturan yang sudah diverifikasi,
            dan menyimpan versi aturan yang dipakai.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <DeadlineDemo />
        </Reveal>
      </section>
    </>
  );
}
