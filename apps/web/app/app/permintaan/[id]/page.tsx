// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { gql, uploadEvidence } from "@/lib/api";
import { DEADLINE_STATUS, EVIDENCE_SRC, REQUEST_STATUS, RESPONSE_CAT, fmtDateTime, toLocalInput } from "@/lib/format";
import { Badge, Button, Confirm, Empty, ErrorBox, Field, Skeleton, Tabs, useQuery, useToast } from "@/components/ui";

const F = `id title status rightCode letterBody sentAt sentVia receivedAt followUpDays right{title} company{slug name}
  deadline{ruleKey ruleVersion legalBasis ruleStatus startedAt dueAt status timezone basisNote disclaimer exceptions}
  timeline{id type actor description occurredAt verification evidenceId} evidence{id originalName mime size sha256 source createdAt} responses{id category note receivedAt evidenceId}`;
const download = (name: string, text: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

function Countdown({ due }: { due: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor((new Date(due).getTime() - now) / 1000);
  if (s <= 0) return <span className="countdown">Terlewati</span>;
  return (
    <span className="countdown" aria-label="Sisa waktu estimasi">
      {Math.floor(s / 3600)}j {String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m {String(s % 60).padStart(2, "0")}d
    </span>
  );
}

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useQuery(
    () => gql<any>(`query($i:String!){request(id:$i){${F}}}`, { i: id }).then((d) => d.request),
    [id],
  );
  const [tab, setTab] = useState("ringkasan");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [send, setSend] = useState({ via: "EMAIL", sentAt: toLocalInput(), receivedAt: "", follow: 14 });
  const [confirm, setConfirm] = useState<string | null>(null);
  const [resp, setResp] = useState({ category: "ACKNOWLEDGED", note: "", receivedAt: toLocalInput(), evidenceId: "" });
  const [note, setNote] = useState("");
  const [rcpt, setRcpt] = useState(toLocalInput());
  const [followUp, setFollowUp] = useState("");
  const file = useRef<HTMLInputElement>(null);
  if (error)
    return (
      <div className="page">
        <ErrorBox error={error} retry={reload} />
      </div>
    );
  if (loading || !data)
    return (
      <div className="page">
        <Skeleton h={400} />
      </div>
    );
  const r = data;
  const sent = ["SENT", "RESPONDED"].includes(r.status);

  const act = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    setErr("");
    try {
      const res = await fn();
      if (res) setData(res);
      toast(ok);
    } catch (e) {
      setErr((e as Error).message);
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setConfirm(null);
    }
  };
  const m = (name: string, args: string, vars: Record<string, unknown>) =>
    gql<any>(`mutation(${args}){${name}{${F}}}`, vars).then((d) => d[name.split("(")[0]]);
  const iso = (v: string) => (v ? new Date(v).toISOString() : null);

  return (
    <div className="page">
      <div className="row between">
        <div>
          <h1>{r.title}</h1>
          <div className="row">
            <Badge tone="info">{REQUEST_STATUS[r.status]}</Badge>
            <Link href={`/perusahaan/${r.company.slug}`}>{r.company.name}</Link>
          </div>
        </div>
      </div>
      {err && (
        <div className="errbox" role="alert" style={{ margin: "16px 0" }}>
          {err}
        </div>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ["ringkasan", "Ringkasan"],
          ["surat", "Surat"],
          ["dossier", "Dossier"],
          ["respons", "Respons"],
        ]}
      />

      {tab === "ringkasan" && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
          <section className="panel">
            <h2>Langkah berikutnya</h2>
            {["DRAFT"].includes(r.status) && (
              <>
                <p>Surat belum selesai ditinjau.</p>
                <Link className="btn btn-primary" href={`/app/permintaan/baru?id=${r.id}`}>
                  Lanjutkan penyusunan
                </Link>
              </>
            )}
            {r.status === "REVIEWED" && (
              <>
                <p>
                  Kirim surat lewat kanal yang kamu pilih (salin dari tab Surat), lalu catat pengirimannya di sini. Hak Data tidak mengirim
                  apa pun otomatis.
                </p>
                <Field
                  label="Dikirim via"
                  value={send.via}
                  onChange={(e: any) => setSend({ ...send, via: e.target.value })}
                  options={[
                    ["EMAIL", "Email"],
                    ["FORM", "Formulir web"],
                    ["POST", "Pos/kurir"],
                    ["OTHER", "Lainnya"],
                  ]}
                />
                <Field
                  label="Waktu dikirim"
                  type="datetime-local"
                  value={send.sentAt}
                  onChange={(e: any) => setSend({ ...send, sentAt: e.target.value })}
                />
                <Field
                  label="Waktu diterima perusahaan (opsional)"
                  type="datetime-local"
                  value={send.receivedAt}
                  onChange={(e: any) => setSend({ ...send, receivedAt: e.target.value })}
                  hint="Isi bila ada tanda terima/balasan otomatis. Penghitungan tenggat dimulai saat pengendali menerima permintaan."
                />
                <Field
                  label="Pengingat tindak lanjut pribadi (hari)"
                  type="number"
                  min={1}
                  max={90}
                  value={send.follow}
                  onChange={(e: any) => setSend({ ...send, follow: Number(e.target.value) })}
                  hint="Bukan tenggat hukum."
                />
                <Button onClick={() => setConfirm("send")}>Catat pengiriman</Button>
                <p>
                  <Link href={`/app/permintaan/baru?id=${r.id}`}>Ubah surat</Link>
                </p>
              </>
            )}
            {sent && (
              <>
                <p>
                  Permintaan terkirim {fmtDateTime(r.sentAt)} via {r.sentVia}. Catat balasan di tab Respons dan simpan bukti di tab Dossier.
                </p>
                <Field
                  label="Waktu diterima perusahaan"
                  type="datetime-local"
                  value={rcpt}
                  onChange={(e: any) => setRcpt(e.target.value)}
                />
                <div className="row">
                  <Button
                    variant="ghost"
                    loading={busy === "rcpt"}
                    onClick={() =>
                      act(
                        "rcpt",
                        () => m(`recordReceipt(id:$i,receivedAt:$t)`, "$i:String!,$t:DateTime!", { i: r.id, t: iso(rcpt) }),
                        "Waktu diterima dicatat, tenggat dihitung ulang.",
                      )
                    }
                  >
                    Catat waktu diterima
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      gql<any>(`query($i:String!){followUpLetter(id:$i)}`, { i: r.id })
                        .then((d) => setFollowUp(d.followUpLetter))
                        .catch((e) => setErr(e.message))
                    }
                  >
                    Surat tindak lanjut
                  </Button>
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <Button loading={busy === "done"} onClick={() => setConfirm("done")}>
                    Tandai selesai
                  </Button>
                  <Button variant="danger" onClick={() => setConfirm("close")}>
                    Tutup permintaan
                  </Button>
                </div>
              </>
            )}
            {["COMPLETED"].includes(r.status) && (
              <p>
                Kamu menandai permintaan ini selesai. Ini penilaianmu, bukan putusan bahwa perusahaan telah memenuhi kewajiban hukumnya.
              </p>
            )}
            {r.status === "CLOSED" && <p>Permintaan ditutup.</p>}
            {followUp && (
              <>
                <h3 style={{ marginTop: 16 }}>Draf tindak lanjut (netral, tidak menuduh)</h3>
                <pre className="letter">{followUp}</pre>
                <div className="row" style={{ marginTop: 8 }}>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(followUp);
                      toast("Disalin.");
                    }}
                  >
                    Salin
                  </Button>
                </div>
              </>
            )}
          </section>
          <section className="panel">
            <h2>Tenggat</h2>
            {!r.deadline ? (
              <p className="muted">Belum ada. Tenggat dihitung saat pengiriman dicatat.</p>
            ) : (
              <>
                <div className="row">
                  <Badge tone={DEADLINE_STATUS[r.deadline.status].tone}>{DEADLINE_STATUS[r.deadline.status].label}</Badge>
                  <Badge>
                    Aturan {r.deadline.ruleKey} v{r.deadline.ruleVersion}
                  </Badge>
                </div>
                {r.deadline.dueAt ? (
                  <div className="deadline" style={{ marginTop: 12 }}>
                    {["COUNTDOWN_ACTIVE", "APPROACHING_DEADLINE"].includes(r.deadline.status) && <Countdown due={r.deadline.dueAt} />}
                    <div>
                      <div>Estimasi tenggat</div>
                      <strong>{fmtDateTime(r.deadline.dueAt)}</strong>
                    </div>
                  </div>
                ) : (
                  <p className="note">
                    Tidak ada hitung mundur hukum untuk hak ini karena aturan tenggatnya belum terverifikasi. Kamu tetap mendapat pengingat
                    tindak lanjut pribadi ({r.followUpDays} hari).
                  </p>
                )}
                <dl className="kv" style={{ marginTop: 12 }}>
                  <dt>Dasar</dt>
                  <dd>{r.deadline.basisNote}</dd>
                  <dt>Pengecualian</dt>
                  <dd>{r.deadline.exceptions ?? "-"}</dd>
                </dl>
                <p className="note">{r.deadline.disclaimer}</p>
              </>
            )}
          </section>
        </div>
      )}

      {tab === "surat" && (
        <section className="panel">
          <h2>Surat</h2>
          {r.letterBody ? (
            <>
              <pre className="letter">{r.letterBody}</pre>
              <div className="row" style={{ marginTop: 12 }}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(r.letterBody);
                    toast("Surat disalin.");
                  }}
                >
                  Salin
                </Button>
                <Button variant="ghost" onClick={() => download(`surat-${r.id}.txt`, r.letterBody)}>
                  Unduh .txt
                </Button>
              </div>
            </>
          ) : (
            <Empty title="Belum ada surat" />
          )}
        </section>
      )}

      {tab === "dossier" && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
          <section className="panel">
            <h2>Kronologi</h2>
            <p className="note">Entri berlabel “Dicatat pengguna” belum diverifikasi independen.</p>
            <ol className="timeline">
              {[...r.timeline].reverse().map((e: any) => (
                <li key={e.id}>
                  <time>{fmtDateTime(e.occurredAt)}</time>
                  <p>{e.description}</p>
                  <Badge tone={e.verification === "SYSTEM_RECORDED" ? "info" : "muted"}>{EVIDENCE_SRC[e.verification]}</Badge>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel">
            <h2>Bukti & lampiran</h2>
            {r.evidence.length === 0 ? (
              <p className="muted">Belum ada bukti. Unggah tangkapan layar atau PDF bukti pengiriman.</p>
            ) : (
              <ul className="list">
                {r.evidence.map((e: any) => (
                  <li key={e.id}>
                    <a href={`/api/evidence/${e.id}/download`}>{e.originalName}</a> <Badge>{EVIDENCE_SRC[e.source]}</Badge>
                    <br />
                    <small className="muted">
                      {Math.round(e.size / 1024)} KB · SHA-256 {e.sha256.slice(0, 16)}…
                    </small>
                  </li>
                ))}
              </ul>
            )}
            {r.status !== "CLOSED" && (
              <>
                <input ref={file} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" aria-label="Pilih berkas bukti" />
                <div className="row" style={{ marginTop: 8 }}>
                  <Button
                    loading={busy === "up"}
                    onClick={() => {
                      const f = file.current?.files?.[0];
                      if (!f) return setErr("Pilih berkas terlebih dahulu.");
                      act(
                        "up",
                        async () => {
                          await uploadEvidence(r.id, f);
                          await reload();
                          if (file.current) file.current.value = "";
                          return null;
                        },
                        "Bukti diunggah.",
                      );
                    }}
                  >
                    Unggah
                  </Button>
                </div>
                <p className="muted">PDF/PNG/JPG/WEBP, maks 10 MB. Jangan unggah data sensitif yang tidak perlu.</p>
              </>
            )}
            <h3 style={{ marginTop: 20 }}>Ekspor</h3>
            <Button
              variant="ghost"
              onClick={() =>
                gql<any>(`query($i:String!){dossierExport(id:$i)}`, { i: r.id })
                  .then((d) => download(`dossier-${r.id}.md`, d.dossierExport))
                  .catch((e) => setErr(e.message))
              }
            >
              Unduh ringkasan dossier
            </Button>
            {sent && (
              <>
                <h3 style={{ marginTop: 20 }}>Catatan tindak lanjut</h3>
                <Field label="Catatan" multiline value={note} onChange={(e: any) => setNote(e.target.value)} />
                <Button
                  variant="ghost"
                  disabled={!note.trim()}
                  loading={busy === "note"}
                  onClick={() =>
                    act(
                      "note",
                      async () => {
                        const d = await m(`addTimelineNote(id:$i,text:$t)`, "$i:String!,$t:String!", { i: r.id, t: note });
                        setNote("");
                        return d;
                      },
                      "Catatan ditambahkan.",
                    )
                  }
                >
                  Tambah ke dossier
                </Button>
              </>
            )}
          </section>
        </div>
      )}

      {tab === "respons" && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
          <section className="panel">
            <h2>Catat respons perusahaan</h2>
            {!sent ? (
              <p className="muted">Tersedia setelah permintaan dikirim.</p>
            ) : (
              <>
                <p className="note">
                  Kategori yang kamu pilih adalah catatanmu. Sistem tidak menyimpulkan perusahaan telah memenuhi kewajiban hukum.
                </p>
                <Field
                  label="Kategori"
                  value={resp.category}
                  onChange={(e: any) => setResp({ ...resp, category: e.target.value })}
                  options={Object.entries(RESPONSE_CAT)}
                />
                <Field
                  label="Waktu diterima"
                  type="datetime-local"
                  value={resp.receivedAt}
                  onChange={(e: any) => setResp({ ...resp, receivedAt: e.target.value })}
                />
                <Field label="Catatan" multiline value={resp.note} onChange={(e: any) => setResp({ ...resp, note: e.target.value })} />
                <Field
                  label="Lampiran balasan (opsional)"
                  value={resp.evidenceId}
                  onChange={(e: any) => setResp({ ...resp, evidenceId: e.target.value })}
                  options={[["", "Tanpa lampiran"], ...r.evidence.map((e: any) => [e.id, e.originalName] as [string, string])]}
                  hint="Unggah balasan dulu di tab Dossier."
                />
                <Button
                  loading={busy === "resp"}
                  onClick={() =>
                    act(
                      "resp",
                      () =>
                        m(
                          `addCompanyResponse(id:$i,category:$c,note:$n,receivedAt:$t,evidenceId:$e)`,
                          "$i:String!,$c:String!,$n:String,$t:DateTime,$e:String",
                          { i: r.id, c: resp.category, n: resp.note || null, t: iso(resp.receivedAt), e: resp.evidenceId || null },
                        ),
                      "Respons dicatat.",
                    )
                  }
                >
                  Simpan respons
                </Button>
              </>
            )}
          </section>
          <section className="panel">
            <h2>Riwayat respons</h2>
            {r.responses.length === 0 ? (
              <Empty title="Belum ada respons tercatat" />
            ) : (
              <ul className="list">
                {[...r.responses].reverse().map((x: any) => (
                  <li key={x.id}>
                    <strong>{RESPONSE_CAT[x.category]}</strong>
                    <br />
                    <small className="muted">{fmtDateTime(x.receivedAt)}</small>
                    {x.note && <p>{x.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <Confirm
        open={confirm === "send"}
        title="Catat pengiriman?"
        body="Setelah dicatat, surat tidak dapat diubah dan estimasi tenggat dihitung. Pastikan kamu sudah benar-benar mengirimnya."
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          act(
            "send",
            () =>
              m(
                `recordRequestSent(id:$i,sentVia:$v,sentAt:$s,receivedAt:$r,followUpDays:$f)`,
                "$i:String!,$v:String!,$s:DateTime,$r:DateTime,$f:Int",
                { i: r.id, v: send.via, s: iso(send.sentAt), r: iso(send.receivedAt), f: send.follow },
              ),
            "Pengiriman dicatat. Estimasi tenggat dibuat.",
          )
        }
      />
      <Confirm
        open={confirm === "done"}
        title="Tandai selesai?"
        body="Ini penilaianmu bahwa permintaan sudah tuntas. Pengingat akan dihentikan."
        onCancel={() => setConfirm(null)}
        onConfirm={() => act("done", () => m(`completeRequest(id:$i)`, "$i:String!", { i: r.id }), "Permintaan ditandai selesai.")}
      />
      <Confirm
        open={confirm === "close"}
        danger
        title="Tutup permintaan?"
        body="Permintaan ditutup dan tidak bisa dibuka kembali. Dossier tetap tersimpan."
        confirmLabel="Tutup permintaan"
        onCancel={() => setConfirm(null)}
        onConfirm={() => act("close", () => m(`closeRequest(id:$i)`, "$i:String!", { i: r.id }), "Permintaan ditutup.")}
      />
    </div>
  );
}
