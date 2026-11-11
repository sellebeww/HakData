// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
/**
 * Satu-satunya tempat nomor pasal untuk surat. Hanya pasal yang teksnya DIBACA langsung
 * (docs/LEGAL_SOURCES.md bagian 1, S1: Pasal 14, 30, 32, 40, 41, 43, 44, 45, 74).
 * Pasal lain (6-11, 33, 42, 50) berstatus VERIFY di sana: dilarang dikutip di surat sebelum dibaca ulang.
 */
export const READ_ARTICLES = [14, 30, 32, 40, 41, 43, 44, 45, 74] as const;
export const LAW = "UU No. 27 Tahun 2022";

const RIGHT_ARTICLES: Record<string, number[]> = {
  ACCESS: [32],
  CORRECTION: [30],
  WITHDRAW_CONSENT: [40],
  RESTRICT: [41],
  DELETE: [43, 44, 45],
  OBJECT_AUTOMATED: [], // Pasal 10 belum dibaca ulang (VERIFY): surat hanya menyebut UU-nya
};
const list = (a: number[]) =>
  a.length > 1
    ? a
        .slice(0, -1)
        .map((n) => `Pasal ${n}`)
        .join(", ") + `, dan Pasal ${a.at(-1)}`
    : `Pasal ${a[0]}`;
const check = (a: number[]) => {
  const bad = a.filter((n) => !(READ_ARTICLES as readonly number[]).includes(n));
  if (bad.length) throw new Error(`Pasal ${bad.join(", ")} belum terverifikasi di LEGAL_SOURCES.md`);
  return a;
};
/** Frasa untuk isi surat, mis. "Pasal 43, Pasal 44, dan Pasal 45 UU No. 27 Tahun 2022". */
export const legalBasis = (code: string) => {
  const a = check(RIGHT_ARTICLES[code] ?? []);
  return a.length ? `${list(a)} ${LAW}` : LAW;
};
/** Label ringkas untuk UI, mis. "Pasal 32 UU 27/2022". */
export const articleLabel = (code: string) => {
  const a = RIGHT_ARTICLES[code] ?? [];
  return a.length ? `${list(a)} UU 27/2022` : "UU 27/2022 (pasal belum diverifikasi)";
};
export const RECORDED_BASIS = `Pasal 14 ${LAW}`; // permohonan tercatat
export const LETTER_DISCLAIMER =
  "Surat ini dibuat dari template umum dan bukan nasihat hukum. Rujukan pasal hanya dari sumber yang sudah diperiksa pengembang; periksa kembali sebelum mengirim.";
