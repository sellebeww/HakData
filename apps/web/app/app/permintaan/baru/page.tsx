// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { gql } from "@/lib/api";
import { CHANNEL_TYPE, VERIFY } from "@/lib/format";
import { Badge, Button, Field, Skeleton, useToast } from "@/components/ui";

const STEPS = ["Perusahaan", "Jenis hak", "Isi data", "Tinjau surat"];
const REQ_FIELDS = `id status letterBody fields rightCode right{code title fields{key label required why multiline}} company{id slug name channels{id type value status}} channel{id}`;

function Wizard() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [companies, setCompanies] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [channelId, setChannelId] = useState("");
  const [rights, setRights] = useState<any[]>([]);
  const [rules, setRules] = useState<Record<string, any>>({});
  const [right, setRight] = useState<any>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [req, setReq] = useState<any>(null);
  const [letter, setLetter] = useState("");

  useEffect(() => {
    gql<any>(
      `{rights{code article title plainMeaning fields{key label required why multiline}} legalRules{rightCode durationHours status}}`,
    )
      .then((d) => {
        setRights(d.rights);
        setRules(Object.fromEntries(d.legalRules.map((r: any) => [r.rightCode, r])));
      })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    const t = setTimeout(
      () =>
        gql<any>(`query($s:String){companies(search:$s,take:6){items{id slug name industry isDemo channels{id type value status}}}}`, {
          s: search || null,
        })
          .then((d) => setCompanies(d.companies.items))
          .catch(() => {}),
      250,
    );
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const slug = sp.get("company");
    if (slug && !company && !sp.get("id"))
      gql<any>(`query($s:String!){company(slug:$s){id slug name industry isDemo channels{id type value status}}}`, { s: slug })
        .then((d) => {
          setCompany(d.company);
          setStep(1);
        })
        .catch(() => {});
  }, [sp, company]);
  useEffect(() => {
    const id = sp.get("id");
    if (!id) return;
    gql<any>(`query($i:String!){request(id:$i){${REQ_FIELDS}}}`, { i: id })
      .then((d) => {
        const r = d.request;
        setReq(r);
        setCompany(r.company);
        setRight(r.right);
        setFields(r.fields ?? {});
        setChannelId(r.channel?.id ?? "");
        setLetter(r.letterBody);
        setStep(r.letterBody ? 3 : 2);
      })
      .catch((e) => setErr(e.message));
  }, [sp]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const buildLetter = () =>
    run(async () => {
      let r = req;
      if (!r)
        r = (
          await gql<any>(
            `mutation($c:String!,$r:String!,$ch:String){createRequest(companyId:$c,rightCode:$r,channelId:$ch){${REQ_FIELDS}}}`,
            { c: company.id, r: right.code, ch: channelId || null },
          )
        ).createRequest;
      await gql(`mutation($i:String!,$f:JSON!,$ch:String){updateRequestFields(id:$i,fields:$f,channelId:$ch){id}}`, {
        i: r.id,
        f: fields,
        ch: channelId || null,
      });
      const g = (await gql<any>(`mutation($i:String!){generateLetter(id:$i){${REQ_FIELDS}}}`, { i: r.id })).generateLetter;
      setReq(g);
      setLetter(g.letterBody);
      setStep(3);
    });
  const approve = () =>
    run(async () => {
      if (letter !== req.letterBody)
        await gql(`mutation($i:String!,$b:String!){updateLetter(id:$i,body:$b){id}}`, { i: req.id, b: letter });
      await gql(`mutation($i:String!){reviewRequest(id:$i){id}}`, { i: req.id });
      toast("Surat disetujui. Sekarang kirim lewat kanal pilihanmu, lalu catat pengirimannya.");
      router.push(`/app/permintaan/${req.id}`);
    });

  const sendable = company?.channels.filter((c: any) => c.type !== "PRIVACY_POLICY_URL") ?? [];
  return (
    <div className="page">
      <h1>Permintaan baru</h1>
      <div className="steps-bar" aria-label="Langkah">
        {STEPS.map((s, i) => (
          <span key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
            {i + 1}. {s}
          </span>
        ))}
      </div>
      {err && (
        <div className="errbox" role="alert" style={{ marginBottom: 16 }}>
          {err}
        </div>
      )}

      {step === 0 && (
        <section className="panel">
          <h2>Pilih perusahaan</h2>
          <Field label="Cari" type="search" value={search} onChange={(e: any) => setSearch(e.target.value)} placeholder="Nama perusahaan" />
          <div className="list">
            {companies.map((c) => (
              <button
                key={c.id}
                className={`panel pick ${company?.id === c.id ? "unread" : ""}`}
                onClick={() => {
                  setCompany(c);
                  setChannelId("");
                }}
                style={{ textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit" }}
              >
                <strong>{c.name}</strong> {c.isDemo && <Badge tone="demo">DEMO</Badge>}
                <p>{c.industry}</p>
              </button>
            ))}
          </div>
          {company && (
            <>
              <h3 style={{ marginTop: 20 }}>Kanal pengiriman</h3>
              {sendable.length === 0 ? (
                <p className="note">
                  Perusahaan ini belum punya kanal terdata. Kamu tetap bisa menyusun surat dan mengirimnya lewat kanal yang kamu temukan
                  sendiri di situs resminya.
                </p>
              ) : (
                <Field
                  label="Kanal yang akan dipakai (opsional)"
                  value={channelId}
                  onChange={(e: any) => setChannelId(e.target.value)}
                  options={[
                    ["", "Belum dipilih"],
                    ...sendable.map(
                      (c: any) => [c.id, `${CHANNEL_TYPE[c.type]}: ${c.value} (${VERIFY[c.status].label})`] as [string, string],
                    ),
                  ]}
                />
              )}
            </>
          )}
          <Button disabled={!company} onClick={() => setStep(1)}>
            Lanjut
          </Button>
        </section>
      )}

      {step === 1 && (
        <section>
          <h2>Hak apa yang ingin kamu gunakan di {company?.name}?</h2>
          <div className="grid">
            {rights.map((r) => {
              const rule = rules[r.code];
              return (
                <button
                  key={r.code}
                  className={`panel ${right?.code === r.code ? "unread" : ""}`}
                  onClick={() => setRight(r)}
                  style={{ textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit" }}
                >
                  <h3>{r.title}</h3>
                  <p>{r.plainMeaning}</p>
                  <p className="muted">
                    {rule?.durationHours ? `Tenggat ${rule.durationHours} jam (terverifikasi)` : "Tanpa tenggat angka terverifikasi"}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <Button variant="ghost" onClick={() => setStep(0)}>
              Kembali
            </Button>
            <Button disabled={!right} onClick={() => setStep(2)}>
              Lanjut
            </Button>
          </div>
        </section>
      )}

      {step === 2 && right && (
        <section className="panel">
          <h2>{right.title}</h2>
          <p>Hanya isi yang diperlukan. Kami tidak meminta KTP. Tiap kolom dijelaskan alasannya.</p>
          {right.fields.map((f: any) => (
            <Field
              key={f.key}
              label={f.label}
              required={f.required}
              multiline={f.multiline}
              hint={f.why}
              value={fields[f.key] ?? ""}
              onChange={(e: any) => setFields({ ...fields, [f.key]: e.target.value })}
            />
          ))}
          <div className="row">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Kembali
            </Button>
            <Button loading={busy} onClick={buildLetter}>
              Buat draf surat
            </Button>
          </div>
        </section>
      )}

      {step === 3 && req && (
        <section className="panel">
          <h2>Tinjau dan sunting surat</h2>
          <p>Baca dengan teliti. Kamu bisa menyuntingnya. Surat tidak dikirim otomatis.</p>
          <Field label="Isi surat" multiline rows={18} value={letter} onChange={(e: any) => setLetter(e.target.value)} />
          <div className="row">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Ubah isian
            </Button>
            <Button loading={busy} onClick={approve}>
              Saya sudah meninjau, setujui
            </Button>
          </div>
        </section>
      )}
      {!req && step === 3 && <Skeleton h={300} />}
    </div>
  );
}
export default function NewRequest() {
  return (
    <Suspense
      fallback={
        <div className="page">
          <Skeleton h={300} />
        </div>
      }
    >
      <Wizard />
    </Suspense>
  );
}
