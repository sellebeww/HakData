// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { gql } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CHANNEL_TYPE, VERIFY, fmtDateTime, toLocalInput } from "@/lib/format";
import { Badge, Button, Empty, ErrorBox, Field, Skeleton, Tabs, useQuery, useToast } from "@/components/ui";

function Moderation() {
  const toast = useToast(); const { data, error, loading, reload } = useQuery(() => gql<any>(`{pendingSubmissions{id companyName type value sourceUrl createdAt}}`), []);
  if (error) return <ErrorBox error={error} retry={reload} />; if (loading || !data) return <Skeleton />;
  const review = async (id: string, approve: boolean) => { try { await gql(`mutation($i:String!,$a:Boolean!){reviewSubmission(id:$i,approve:$a){id}}`, { i: id, a: approve }); toast(approve ? "Disetujui sebagai laporan komunitas." : "Ditolak."); reload(); } catch (e) { toast((e as Error).message, "err"); } };
  return data.pendingSubmissions.length === 0 ? <Empty title="Antrean kosong" body="Tidak ada usulan kanal yang menunggu." /> : (
    <div className="list">{data.pendingSubmissions.map((s: any) => (<div className="panel" key={s.id}><strong>{s.companyName}</strong> <Badge>{CHANNEL_TYPE[s.type]}</Badge><p style={{ wordBreak: "break-all" }}>{s.value}</p>
      <p>Sumber: <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">{s.sourceUrl}</a> · {fmtDateTime(s.createdAt)}</p><p className="note">Buka sumber dan pastikan alamat benar-benar tercantum sebelum menyetujui.</p>
      <div className="row"><Button onClick={() => review(s.id, true)}>Setujui</Button><Button variant="danger" onClick={() => review(s.id, false)}>Tolak</Button></div></div>))}</div>);
}

function Companies({ admin }: { admin: boolean }) {
  const toast = useToast(); const { data, error, loading, reload } = useQuery(() => gql<any>(`{companies(take:50){items{id name industry isDemo channels{id type value status}}}}`), []);
  const [c, setC] = useState({ name: "", industry: "", website: "" }); const [ch, setCh] = useState({ companyId: "", type: "PRIVACY_EMAIL", value: "", status: "UNVERIFIED", sourceUrl: "" });
  if (error) return <ErrorBox error={error} retry={reload} />; if (loading || !data) return <Skeleton />;
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); reload(); } catch (e) { toast((e as Error).message, "err"); } };
  const sts = Object.entries(VERIFY).filter(([k]) => admin || k !== "VERIFIED").map(([k, v]) => [k, v.label] as [string, string]);
  return (<div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
    <section className="panel"><h2>Tambah perusahaan</h2><Field label="Nama" value={c.name} onChange={(e: any) => setC({ ...c, name: e.target.value })} /><Field label="Industri" value={c.industry} onChange={(e: any) => setC({ ...c, industry: e.target.value })} /><Field label="Website (https)" value={c.website} onChange={(e: any) => setC({ ...c, website: e.target.value })} />
      <Button onClick={() => run(() => gql(`mutation($i:CompanyInput!){upsertCompany(input:$i){id}}`, { i: { name: c.name, industry: c.industry, website: c.website || null } }), "Perusahaan disimpan.")}>Simpan</Button></section>
    <section className="panel"><h2>Tambah/ubah kanal</h2><p className="note">Jangan pernah mengarang alamat. Isi hanya dari sumber yang bisa dibuka.{!admin && " Status VERIFIED hanya untuk admin."}</p>
      <Field label="Perusahaan" value={ch.companyId} onChange={(e: any) => setCh({ ...ch, companyId: e.target.value })} options={[["", "Pilih..."], ...data.companies.items.map((x: any) => [x.id, x.name] as [string, string])]} />
      <Field label="Jenis" value={ch.type} onChange={(e: any) => setCh({ ...ch, type: e.target.value })} options={Object.entries(CHANNEL_TYPE)} /><Field label="Nilai" value={ch.value} onChange={(e: any) => setCh({ ...ch, value: e.target.value })} />
      <Field label="Status" value={ch.status} onChange={(e: any) => setCh({ ...ch, status: e.target.value })} options={sts} /><Field label="URL sumber" value={ch.sourceUrl} onChange={(e: any) => setCh({ ...ch, sourceUrl: e.target.value })} />
      <Button disabled={!ch.companyId} onClick={() => run(() => gql(`mutation($i:ChannelInput!){upsertChannel(input:$i){id}}`, { i: { ...ch, sourceUrl: ch.sourceUrl || null } }), "Kanal disimpan.")}>Simpan kanal</Button></section>
    <section className="panel" style={{ gridColumn: "1/-1" }}><h2>Perusahaan ({data.companies.items.length})</h2><div className="table-wrap"><table className="table"><thead><tr><th>Nama</th><th>Industri</th><th>Kanal</th></tr></thead><tbody>
      {data.companies.items.map((x: any) => <tr key={x.id}><td>{x.name}</td><td>{x.industry}</td><td>{x.channels.map((k: any) => <div key={k.id}><Badge tone={VERIFY[k.status].tone}>{VERIFY[k.status].label}</Badge> {k.value}</div>)}</td></tr>)}</tbody></table></div></section></div>);
}

function Rules() {
  const toast = useToast(); const { data, error, loading, reload } = useQuery(() => gql<any>(`{adminLegalRules{id rightCode version legalBasis durationHours status exceptions verifiedBy effectiveFrom supersededAt}}`), []);
  const [f, setF] = useState({ rightCode: "ACCESS", legalBasis: "", durationHours: "", status: "VERIFIED", exceptions: "", verifiedBy: "", effectiveFrom: toLocalInput() });
  if (error) return <ErrorBox error={error} retry={reload} />; if (loading || !data) return <Skeleton />;
  const publish = async () => { try { await gql(`mutation($i:PublishRuleInput!){publishLegalRule(input:$i){id}}`, { i: { rightCode: f.rightCode, legalBasis: f.legalBasis, durationHours: f.durationHours ? Number(f.durationHours) : null, status: f.status, exceptions: f.exceptions || null, verifiedBy: f.verifiedBy, effectiveFrom: new Date(f.effectiveFrom).toISOString() } }); toast("Versi aturan baru diterbitkan. Permintaan lama tetap memakai versi sebelumnya."); reload(); } catch (e) { toast((e as Error).message, "err"); } };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (<div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
    <section className="panel"><h2>Terbitkan versi aturan baru</h2><p className="note">Aturan lama tidak diubah, hanya ditandai digantikan. Status VERIFIED wajib berdasarkan teks resmi.</p>
      <Field label="Hak" value={f.rightCode} onChange={set("rightCode")} options={["ACCESS", "CORRECTION", "WITHDRAW_CONSENT", "RESTRICT", "DELETE", "OBJECT_AUTOMATED"].map((x) => [x, x] as [string, string])} />
      <Field label="Dasar hukum" value={f.legalBasis} onChange={set("legalBasis")} /><Field label="Durasi (jam kalender)" type="number" value={f.durationHours} onChange={set("durationHours")} />
      <Field label="Status" value={f.status} onChange={set("status")} options={[["VERIFIED", "VERIFIED"], ["NEEDS_CONFIRMATION", "NEEDS_CONFIRMATION"], ["NOT_VERIFIED", "NOT_VERIFIED"]]} /><Field label="Pengecualian" multiline value={f.exceptions} onChange={set("exceptions")} />
      <Field label="Diverifikasi oleh" value={f.verifiedBy} onChange={set("verifiedBy")} /><Field label="Berlaku sejak" type="datetime-local" value={f.effectiveFrom} onChange={set("effectiveFrom")} /><Button onClick={publish}>Terbitkan</Button></section>
    <section className="panel" style={{ gridColumn: "1/-1" }}><h2>Semua versi</h2><div className="table-wrap"><table className="table"><thead><tr><th>Hak</th><th>v</th><th>Dasar</th><th>Jam</th><th>Status</th><th>Berlaku</th><th>Digantikan</th></tr></thead><tbody>
      {data.adminLegalRules.map((r: any) => <tr key={r.id}><td>{r.rightCode}</td><td>{r.version}</td><td>{r.legalBasis}</td><td>{r.durationHours ?? "-"}</td><td><Badge tone={r.status === "VERIFIED" ? "ok" : "warn"}>{r.status}</Badge></td><td>{fmtDateTime(r.effectiveFrom)}</td><td>{r.supersededAt ? fmtDateTime(r.supersededAt) : "berlaku"}</td></tr>)}</tbody></table></div></section></div>);
}

function Audit() {
  const { data, error, loading, reload } = useQuery(() => gql<any>(`{auditLogs(take:100){id actorId action entity entityId createdAt}}`), []);
  if (error) return <ErrorBox error={error} retry={reload} />; if (loading || !data) return <Skeleton />;
  return (<section className="panel"><h2>Audit log (hanya baca)</h2><div className="table-wrap"><table className="table"><thead><tr><th>Waktu</th><th>Aksi</th><th>Entitas</th><th>Aktor</th></tr></thead><tbody>
    {data.auditLogs.map((a: any) => <tr key={a.id}><td>{fmtDateTime(a.createdAt)}</td><td>{a.action}</td><td>{a.entity} {a.entityId?.slice(0, 8)}</td><td>{a.actorId?.slice(0, 8) ?? "sistem"}</td></tr>)}</tbody></table></div></section>);
}

export default function Admin() {
  const { me, loading } = useAuth(); const r = useRouter(); const [tab, setTab] = useState("moderasi");
  useEffect(() => { if (!loading && (!me || me.role === "USER")) r.replace(me ? "/app" : "/masuk"); }, [loading, me, r]); // UX saja; backend yang menegakkan peran
  if (loading || !me || me.role === "USER") return <div className="page"><Skeleton h={200} /></div>;
  const isAdmin = me.role === "ADMIN";
  return (<div className="page"><h1>Panel {isAdmin ? "admin" : "moderator"}</h1>
    <Tabs value={tab} onChange={setTab} tabs={[["moderasi", "Antrean moderasi"], ["perusahaan", "Perusahaan & kanal"], ...(isAdmin ? [["aturan", "Aturan hukum"], ["audit", "Audit log"]] as [string, string][] : [])]} />
    {tab === "moderasi" && <Moderation />}{tab === "perusahaan" && <Companies admin={isAdmin} />}{isAdmin && tab === "aturan" && <Rules />}{isAdmin && tab === "audit" && <Audit />}</div>);
}
