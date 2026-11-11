// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// Sumber pasal: docs/legal-research.md (UU 27/2022). Teks penjelasan ditulis untuk orang awam.
import { articleLabel, legalBasis, RECORDED_BASIS } from "./legal-refs";
export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  why: string;
  multiline?: boolean;
}
export interface RightDef {
  code: string;
  article: string;
  title: string;
  plainMeaning: string;
  sortOrder: number;
  fields: FieldDef[];
  templateBody: string;
}
const COMMON: FieldDef[] = [
  { key: "fullName", label: "Nama lengkap", required: true, why: "Agar perusahaan dapat mencocokkan permintaan dengan akun Anda." },
  { key: "city", label: "Kota (untuk tanggal surat)", required: false, why: "Hanya untuk kop tanggal surat." },
  {
    key: "accountIdentifier",
    label: "Email/nomor/username akun di perusahaan",
    required: true,
    why: "Pengenal yang Anda pakai di layanan tersebut. Tidak perlu KTP.",
  },
];
const HEAD = `Kepada Yth.
Pejabat/Petugas Pelindungan Data Pribadi
{{companyName}}

Perihal: {{subject}}

Dengan hormat,

Saya yang bertanda tangan di bawah ini:
Nama: {{fullName}}
Pengenal akun: {{accountIdentifier}}

adalah subjek data pribadi yang akunnya/datanya terdaftar pada layanan {{companyName}}.
`;
const TAIL = `
Permohonan ini saya sampaikan secara tercatat sebagaimana dimaksud dalam ${RECORDED_BASIS} tentang Pelindungan Data Pribadi. Mohon konfirmasi penerimaan permohonan ini dan beri tahu saya apabila diperlukan informasi tambahan untuk memverifikasi identitas saya, dengan cara yang meminimalkan data yang diminta.

Mohon tanggapan tertulis disampaikan melalui kanal yang sama. Terima kasih atas perhatian dan kerja samanya.

{{city}}, {{date}}
Hormat saya,

{{fullName}}
`;
const mk = (body: string) => HEAD + body + TAIL;

export const RIGHTS: RightDef[] = [
  {
    code: "ACCESS",
    article: articleLabel("ACCESS"),
    title: "Akses & salinan data",
    sortOrder: 1,
    plainMeaning:
      "Kamu bisa meminta tahu data pribadi apa yang perusahaan pegang tentangmu, termasuk rekam jejak pemrosesannya, dan meminta salinannya.",
    fields: [
      ...COMMON,
      {
        key: "scope",
        label: "Data yang ingin diketahui (opsional)",
        required: false,
        multiline: true,
        why: "Membatasi cakupan membantu perusahaan menjawab lebih cepat. Kosongkan untuk semua data.",
      },
    ],
    templateBody:
      mk(`berdasarkan ${legalBasis("ACCESS")}, mengajukan permohonan akses dan salinan atas data pribadi saya yang Saudara proses, beserta rekam jejak pemrosesannya.
Cakupan yang saya minta: {{scope}}

Saya juga memohon informasi mengenai tujuan pemrosesan dan pihak-pihak yang menerima data tersebut.`),
  },
  {
    code: "CORRECTION",
    article: articleLabel("CORRECTION"),
    title: "Perbaikan data",
    sortOrder: 2,
    plainMeaning:
      "Kamu bisa meminta data yang salah atau usang diperbaiki, dilengkapi, atau diperbarui, dan perusahaan wajib memberi tahu hasilnya.",
    fields: [
      ...COMMON,
      {
        key: "fieldToCorrect",
        label: "Data yang perlu diperbaiki",
        required: true,
        why: "Perusahaan perlu tahu bagian data yang dimaksud.",
      },
      { key: "currentValue", label: "Isi saat ini (yang salah)", required: false, why: "Membantu menemukan data yang tepat." },
      { key: "correctValue", label: "Isi yang benar", required: true, why: "Nilai pengganti yang Anda minta." },
    ],
    templateBody: mk(`berdasarkan ${legalBasis("CORRECTION")}, mengajukan permohonan pembaruan/perbaikan data pribadi saya.
Data yang perlu diperbaiki: {{fieldToCorrect}}
Isi saat ini: {{currentValue}}
Isi yang benar: {{correctValue}}

Mohon hasil pembaruan/perbaikan diberitahukan kepada saya.`),
  },
  {
    code: "WITHDRAW_CONSENT",
    article: articleLabel("WITHDRAW_CONSENT"),
    title: "Tarik persetujuan",
    sortOrder: 3,
    plainMeaning:
      "Kamu bisa mencabut persetujuan yang pernah diberikan, dan perusahaan wajib menghentikan pemrosesan yang didasarkan pada persetujuan itu.",
    fields: [
      ...COMMON,
      {
        key: "consentContext",
        label: "Persetujuan/tujuan yang ditarik",
        required: true,
        multiline: true,
        why: "Misalnya: pemasaran, berbagi data ke mitra, atau pelacakan.",
      },
    ],
    templateBody:
      mk(`berdasarkan ${legalBasis("WITHDRAW_CONSENT")}, menyatakan menarik kembali persetujuan pemrosesan data pribadi saya untuk:
{{consentContext}}

Mohon pemrosesan atas dasar persetujuan tersebut dihentikan dan hal itu dikonfirmasi kepada saya.`),
  },
  {
    code: "RESTRICT",
    article: articleLabel("RESTRICT"),
    title: "Tunda / batasi pemrosesan",
    sortOrder: 4,
    plainMeaning:
      "Kamu bisa meminta pemrosesan datamu ditunda atau dibatasi sebagian atau seluruhnya, dengan pengecualian tertentu yang diatur UU.",
    fields: [
      ...COMMON,
      {
        key: "restrictScope",
        label: "Pemrosesan yang ingin dibatasi",
        required: true,
        multiline: true,
        why: "Jelaskan pemrosesan apa yang ingin ditunda/dibatasi.",
      },
      {
        key: "restrictReason",
        label: "Alasan (opsional)",
        required: false,
        multiline: true,
        why: "Membantu perusahaan menilai permintaan secara proporsional.",
      },
    ],
    templateBody:
      mk(`berdasarkan ${legalBasis("RESTRICT")}, mengajukan permohonan penundaan dan/atau pembatasan pemrosesan data pribadi saya, yaitu:
{{restrictScope}}
Alasan: {{restrictReason}}

Apabila ada bagian yang tidak dapat dipenuhi karena pengecualian dalam undang-undang, mohon dijelaskan secara tertulis bagian dan dasar hukumnya.`),
  },
  {
    code: "DELETE",
    article: articleLabel("DELETE"),
    title: "Hapus / musnahkan data",
    sortOrder: 5,
    plainMeaning:
      "Kamu bisa meminta pemrosesan diakhiri dan datamu dihapus atau dimusnahkan. UU memberi pengecualian dan tidak menyebut angka tenggat tertentu untuk hak ini.",
    fields: [
      ...COMMON,
      {
        key: "deleteScope",
        label: "Data yang ingin dihapus",
        required: true,
        multiline: true,
        why: "Seluruh akun atau data tertentu saja.",
      },
      { key: "reason", label: "Alasan (opsional)", required: false, multiline: true, why: "Tidak wajib." },
    ],
    templateBody:
      mk(`berdasarkan ${legalBasis("DELETE")}, mengajukan permohonan pengakhiran pemrosesan serta penghapusan/pemusnahan data pribadi saya, yaitu:
{{deleteScope}}
Alasan: {{reason}}

Mohon penghapusan/pemusnahan diberitahukan kepada saya. Apabila sebagian data harus tetap disimpan berdasarkan ketentuan peraturan perundang-undangan, mohon dijelaskan data yang dimaksud, dasar hukumnya, dan jangka waktu penyimpanannya.`),
  },
  {
    code: "OBJECT_AUTOMATED",
    article: articleLabel("OBJECT_AUTOMATED"),
    title: "Keberatan keputusan otomatis",
    sortOrder: 6,
    plainMeaning:
      "Kamu bisa menyatakan keberatan atas keputusan yang diambil murni oleh sistem otomatis, termasuk profiling, bila berakibat hukum atau berdampak signifikan bagimu. Tata caranya menunggu peraturan pemerintah.",
    fields: [
      ...COMMON,
      {
        key: "decisionDescription",
        label: "Keputusan otomatis yang dipermasalahkan",
        required: true,
        multiline: true,
        why: "Misalnya: penolakan pinjaman, pemblokiran akun.",
      },
      { key: "decisionDate", label: "Tanggal keputusan (opsional)", required: false, why: "Membantu perusahaan menelusuri." },
    ],
    templateBody:
      mk(`berdasarkan ${legalBasis("OBJECT_AUTOMATED")}, menyatakan keberatan atas keputusan yang menurut saya hanya didasarkan pada pemrosesan secara otomatis, yaitu:
{{decisionDescription}}
Tanggal keputusan: {{decisionDate}}

Mohon penjelasan mengenai dasar keputusan tersebut dan kemungkinan peninjauan oleh petugas manusia.`),
  },
];
export const rightByCode = (c: string) => RIGHTS.find((r) => r.code === c);
