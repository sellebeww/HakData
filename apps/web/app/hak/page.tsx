// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { gql } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Badge, ErrorBox, Skeleton, useQuery } from "@/components/ui";

export default function Rights() {
  const { data, error, loading, reload } = useQuery(() => Promise.all([gql<any>(`{rights{code article title plainMeaning fields{label required why}}}`), gql<any>(`{legalRules{id rightCode version legalBasis durationHours status exceptions verifiedBy lastReviewedAt}}`)]), []);
  if (error) return <div className="page"><ErrorBox error={error} retry={reload} /></div>;
  if (loading || !data) return <div className="page"><Skeleton h={400} /></div>;
  const rules = Object.fromEntries(data[1].legalRules.map((r: any) => [r.rightCode, r]));
  return (
    <div className="page">
      <h1>Hak kamu atas data pribadi</h1>
      <p className="sub">Berdasarkan UU No. 27 Tahun 2022. Setiap hak punya dasar hukum dan surat sendiri. Permohonan diajukan secara <strong>tercatat</strong> (Pasal 14), dan itulah yang dibantu dokumentasikan oleh Hak Data.</p>
      <div className="grid">{data[0].rights.map((r: any) => { const rule = rules[r.code];
        return (<article key={r.code} className="panel"><h2>{r.title}</h2><Badge>{r.article}</Badge><p>{r.plainMeaning}</p>
          <p><strong>Yang perlu disiapkan:</strong> {r.fields.filter((f: any) => f.required).map((f: any) => f.label).join(", ")}</p>
          {rule && <p className="note">{rule.durationHours ? <>Tenggat: <strong>{rule.durationHours} jam</strong> sejak pengendali menerima permintaan ({rule.legalBasis}). </> : <>Tidak ada angka tenggat terverifikasi ({rule.legalBasis}). </>}
            <Badge tone={rule.status === "VERIFIED" ? "ok" : "warn"}>{rule.status === "VERIFIED" ? "Aturan terverifikasi" : "Belum terverifikasi"}</Badge></p>}</article>); })}</div>
      <section className="panel" style={{ marginTop: 24 }}><h2>Tabel aturan tenggat yang tercatat</h2>
        <div className="table-wrap"><table className="table"><thead><tr><th>Hak</th><th>Dasar hukum</th><th>Tenggat</th><th>Pengecualian</th><th>Status</th><th>Ditinjau</th></tr></thead><tbody>
          {data[1].legalRules.map((r: any) => (<tr key={r.id}><td>{r.rightCode}</td><td>{r.legalBasis}</td><td>{r.durationHours ? `${r.durationHours} jam kalender` : "Tidak ada"}</td><td>{r.exceptions ?? "-"}</td>
            <td><Badge tone={r.status === "VERIFIED" ? "ok" : "warn"}>{r.status}</Badge> v{r.version}</td><td>{r.lastReviewedAt ? fmtDate(r.lastReviewedAt) : "-"}</td></tr>))}</tbody></table></div>
        <p className="note">Penghitungan adalah estimasi dan dimulai saat pengendali <em>menerima</em> permintaan. PP 33/2026 baru berlaku 16 Januari 2027 dan belum tercermin di aturan di atas. Ditinjau oleh pengembang, belum oleh ahli hukum. Lihat docs/legal-research.md.</p></section>
      <div className="row" style={{ marginTop: 24 }}><Link className="btn btn-primary" href="/perusahaan">Pilih perusahaan</Link></div>
    </div>
  );
}
