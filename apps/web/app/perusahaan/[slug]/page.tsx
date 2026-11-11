// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { gql } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CHANNEL_TYPE, VERIFY, fmtDate } from "@/lib/format";
import { Badge, Button, ErrorBox, Field, Skeleton, useQuery, useToast } from "@/components/ui";

export default function CompanyPage() {
  const { slug } = useParams<{ slug: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useQuery(
    () =>
      Promise.all([
        gql<any>(
          `query($s:String!){company(slug:$s){id slug name brand legalName industry website isDemo notes channels{id type value status sourceUrl lastCheckedAt note}}}`,
          { s: slug },
        ),
        gql<any>(
          `query($s:String!){companyStats(slug:$s){isDemoData sufficient minSample requestsRecorded withEvidence responsesRecorded responseRatio medianResponseHours method label}}`,
          { s: slug },
        ),
      ]),
    [slug],
  );
  const [f, setF] = useState({ type: "PRIVACY_EMAIL", value: "", sourceUrl: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (error)
    return (
      <div className="page">
        <ErrorBox error={error} retry={reload} />
      </div>
    );
  if (loading || !data)
    return (
      <div className="page">
        <Skeleton h={300} />
      </div>
    );
  const c = data[0].company,
    st = data[1].companyStats;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await gql(`mutation($c:String!,$t:String!,$v:String!,$s:String!){submitChannel(companyId:$c,type:$t,value:$v,sourceUrl:$s){id}}`, {
        c: c.id,
        t: f.type,
        v: f.value,
        s: f.sourceUrl,
      });
      toast("Usulan terkirim dan menunggu moderasi.");
      setF({ ...f, value: "", sourceUrl: "" });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <div className="row between">
        <h1>{c.name}</h1>
        {c.isDemo && <Badge tone="demo">DATA DEMO · fiktif</Badge>}
      </div>
      <p className="sub">
        {c.industry}
        {c.legalName ? ` · ${c.legalName}` : ""}
        {c.website ? (
          <>
            {" "}
            ·{" "}
            <a href={c.website} rel="noopener noreferrer" target="_blank">
              {c.website}
            </a>
          </>
        ) : null}
      </p>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <section className="panel">
          <h2>Kanal privasi</h2>
          {c.channels.length === 0 ? (
            <p>Belum ada kanal tercatat. Anda dapat mengusulkan kanal beserta sumbernya.</p>
          ) : (
            <ul className="list">
              {c.channels.map((ch: any) => (
                <li key={ch.id}>
                  <div className="row between">
                    <strong>{CHANNEL_TYPE[ch.type]}</strong>
                    <Badge tone={VERIFY[ch.status].tone}>{VERIFY[ch.status].label}</Badge>
                  </div>
                  <div style={{ wordBreak: "break-all" }}>{ch.value}</div>
                  <small className="muted">
                    {ch.lastCheckedAt ? `Diperiksa ${fmtDate(ch.lastCheckedAt)}` : "Belum pernah diperiksa"}
                    {ch.sourceUrl ? (
                      <>
                        {" "}
                        ·{" "}
                        <a href={ch.sourceUrl} target="_blank" rel="noopener noreferrer">
                          sumber
                        </a>
                      </>
                    ) : (
                      " · tanpa sumber"
                    )}
                  </small>
                  {ch.status === "OUTDATED" && (
                    <p className="note">Kanal ini mungkin sudah tidak berlaku. Periksa situs resmi sebelum mengirim.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="row" style={{ marginTop: 16 }}>
            <Link className="btn btn-primary" href={`/app/permintaan/baru?company=${c.slug}`}>
              Ajukan permintaan data
            </Link>
          </div>
        </section>
        <section className="panel">
          <h2>Statistik agregat</h2>
          <Badge tone={st.isDemoData ? "demo" : "info"}>{st.label}</Badge>
          <div className="stat">
            <div>
              <b>{st.requestsRecorded}</b>
              <span>permintaan tercatat</span>
            </div>
            <div>
              <b>{st.responsesRecorded}</b>
              <span>respons tercatat</span>
            </div>
            <div>
              <b>{st.withEvidence}</b>
              <span>punya bukti</span>
            </div>
          </div>
          {st.sufficient ? (
            <div className="stat">
              <div>
                <b>{Math.round(st.responseRatio * 100)}%</b>
                <span>rasio respons tercatat</span>
              </div>
              <div>
                <b>{st.medianResponseHours != null ? `${st.medianResponseHours} jam` : "n/a"}</b>
                <span>median ke respons pertama</span>
              </div>
            </div>
          ) : (
            <p className="note">
              Belum tersedia: sampel kurang dari {st.minSample} permintaan. Kami tidak menampilkan angka dari data yang terlalu sedikit.
            </p>
          )}
          <details>
            <summary className="muted">Metode perhitungan</summary>
            <p>{st.method}</p>
          </details>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Usulkan kanal atau koreksi</h2>
        {!me ? (
          <p>
            <Link href="/masuk">Masuk</Link> untuk mengusulkan kanal. Wajib menyertakan sumber dan akan dimoderasi.
          </p>
        ) : (
          <form onSubmit={submit} className="grid">
            <Field
              label="Jenis kanal"
              value={f.type}
              onChange={(e: any) => setF({ ...f, type: e.target.value })}
              options={Object.entries(CHANNEL_TYPE)}
            />
            <Field label="Nilai (email/URL/alamat)" required value={f.value} onChange={(e: any) => setF({ ...f, value: e.target.value })} />
            <Field
              label="URL sumber (https)"
              required
              value={f.sourceUrl}
              onChange={(e: any) => setF({ ...f, sourceUrl: e.target.value })}
              hint="Halaman resmi yang memuat kanal ini."
              error={err}
            />
            <div>
              <Button type="submit" loading={busy}>
                Kirim usulan
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
