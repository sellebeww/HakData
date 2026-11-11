// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { readFileSync } from "fs";
import * as path from "path";
import { renderLetter } from "./letter";
import { READ_ARTICLES, legalBasis } from "./legal-refs";
import { RIGHTS } from "./rights.catalog";

const values = (fields: { key: string }[]) => ({
  companyName: "PT Contoh Nusantara",
  subject: "Permohonan Uji Data Pribadi",
  date: "11 November 2026",
  city: "Jakarta",
  ...Object.fromEntries(fields.map((f) => [f.key, `isi-${f.key}`])),
});

describe("surat per jenis hak", () => {
  it.each(RIGHTS.map((r) => [r.code, r] as const))("snapshot %s", (_c, r) => {
    expect(renderLetter(r.templateBody, values(r.fields))).toMatchSnapshot();
  });
  it("bahasa formal tanpa ancaman, ada identitas pemohon dan perusahaan", () => {
    for (const r of RIGHTS) {
      const out = renderLetter(r.templateBody, values(r.fields));
      expect(out).toMatch(/^Kepada Yth\./);
      expect(out).toContain("PT Contoh Nusantara");
      expect(out).toContain("isi-fullName");
      expect(out).toMatch(/Hormat saya/);
      expect(out.toLowerCase()).not.toMatch(/gugat|somasi|pidana|ancam/);
    }
  });
});

describe("rujukan hukum hanya dari LEGAL_SOURCES.md", () => {
  const doc = readFileSync(path.join(__dirname, "../../../../docs/LEGAL_SOURCES.md"), "utf8");
  // baris S1 mencatat pasal yang dibaca: "Pasal 14, 30, 32, 40, 41, 43, 44, 45, 74"
  const s1 = doc.split("\n").find((l) => l.startsWith("| S1 |"))!;
  const read = (s1.match(/Pasal ([\d, ]+?)(?: dan bagian|\.)/)![1].match(/\d+/g) ?? []).map(Number);

  it("konfigurasi READ_ARTICLES sama dengan pasal yang tercatat dibaca di dokumen", () => expect([...READ_ARTICLES]).toEqual(read));
  it("setiap 'Pasal N' di setiap template dan label termasuk pasal yang dibaca", () => {
    for (const r of RIGHTS) {
      const text = renderLetter(r.templateBody, values(r.fields)) + " " + r.article;
      for (const n of text.match(/Pasal (\d+)/g)?.map((m) => Number(m.slice(6))) ?? []) expect(read).toContain(n);
    }
  });
  it("hak tanpa pasal terverifikasi hanya menyebut UU-nya", () => expect(legalBasis("OBJECT_AUTOMATED")).toBe("UU No. 27 Tahun 2022"));
});
