// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { gql } from "@/lib/api";
import { EVIDENCE_SRC, REQUEST_STATUS, RESPONSE_CAT, fmtDateTime, fmtDuration, statusTone } from "@/lib/format";
import { Badge, Button, Empty, ErrorBox, Skeleton, useQuery } from "@/components/ui";

const Q = `query($i:String!){dossier(requestId:$i){
  deliveries{id kind toAddress subject messageId contentSha256 sentAt}
  request{id title status companyName sentAt dueAt
    events{id type actor description occurredAt verification evidence{id originalName sha256}}
    evidence{id originalName mime size sha256 source}
    responses{id category note receivedAt simulated elapsedMs lateByMs evidence{id originalName}}}}}`;

export default function DossierPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useQuery(() => gql<any>(Q, { i: id }).then((d) => d.dossier), [id]);
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
  const { request: r, deliveries } = data;
  const exportMd = async () => {
    const d = await gql<any>(`query($i:String!){dossierExport(id:$i)}`, { i: r.id });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([d.dossierExport], { type: "text/markdown;charset=utf-8" }));
    a.download = `dossier-${r.id}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="page">
      <p>
        <Link href={`/app/permintaan/${r.id}`}>← Kembali ke permintaan</Link>
      </p>
      <div className="row between">
        <div>
          <h1>Dossier: {r.title}</h1>
          <div className="row">
            <Badge tone={statusTone(r.status)}>{REQUEST_STATUS[r.status]}</Badge>
            <span className="muted">{r.companyName}</span>
            {r.dueAt && <span className="muted">Estimasi tenggat {fmtDateTime(r.dueAt)}</span>}
          </div>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={exportMd}>
            Unduh ekspor
          </Button>
          <Button variant="ghost" onClick={() => window.print()}>
            Cetak
          </Button>
        </div>
      </div>
      <p className="note">
        Isi dossier dicatat oleh pengguna dan sistem. Entri “Dicatat pengguna” belum diverifikasi independen. Estimasi tenggat bukan putusan
        pelanggaran.
      </p>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <section className="panel">
          <h2>Kronologi</h2>
          <ol className="timeline">
            {r.events.map((e: any) => (
              <li key={e.id}>
                <time>{fmtDateTime(e.occurredAt)}</time>
                <p>{e.description}</p>
                <Badge tone={e.verification === "SYSTEM_RECORDED" ? "info" : "muted"}>{EVIDENCE_SRC[e.verification]}</Badge>
                {e.evidence && (
                  <small className="muted">
                    {" "}
                    Lampiran: <a href={`/api/evidence/${e.evidence.id}/download`}>{e.evidence.originalName}</a>
                  </small>
                )}
              </li>
            ))}
          </ol>
        </section>

        <div>
          <section className="panel">
            <h2>Balasan perusahaan</h2>
            {r.responses.length === 0 ? (
              <Empty title="Belum ada balasan tercatat" />
            ) : (
              <ul className="list">
                {r.responses.map((x: any) => (
                  <li key={x.id}>
                    <strong>{RESPONSE_CAT[x.category]}</strong> {x.simulated && <Badge>Simulasi</Badge>}
                    <br />
                    <small className="muted">{fmtDateTime(x.receivedAt)}</small>
                    {x.elapsedMs != null && <p>Waktu sejak awal hitungan: {fmtDuration(x.elapsedMs)}</p>}
                    {x.lateByMs != null &&
                      (x.lateByMs > 0 ? (
                        <p>
                          <Badge tone="danger">Terlambat {fmtDuration(x.lateByMs)}</Badge> dari estimasi tenggat
                        </p>
                      ) : (
                        <p>
                          <Badge tone="ok">Dalam estimasi tenggat</Badge>
                        </p>
                      ))}
                    {x.note && <p>{x.note}</p>}
                    {x.evidence && <a href={`/api/evidence/${x.evidence.id}/download`}>{x.evidence.originalName}</a>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" style={{ marginTop: 16 }}>
            <h2>Bukti & lampiran</h2>
            {r.evidence.length === 0 ? (
              <p className="muted">Belum ada lampiran. Unggah dari halaman permintaan, tab Dossier.</p>
            ) : (
              <ul className="list">
                {r.evidence.map((e: any) => (
                  <li key={e.id}>
                    <a href={`/api/evidence/${e.id}/download`}>{e.originalName}</a> <Badge>{EVIDENCE_SRC[e.source]}</Badge>
                    <br />
                    <small className="muted">
                      {Math.round(e.size / 1024)} KB · SHA-256 {e.sha256}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" style={{ marginTop: 16 }}>
            <h2>Bukti kirim email</h2>
            {deliveries.length === 0 ? (
              <p className="muted">Tidak ada email yang dikirim lewat Hak Data untuk permintaan ini.</p>
            ) : (
              <ul className="list">
                {deliveries.map((d: any) => (
                  <li key={d.id}>
                    <strong>{d.kind === "REQUEST" ? "Permintaan" : "Pengingat"}</strong> ke {d.toAddress}
                    <br />
                    <small className="muted">
                      {fmtDateTime(d.sentAt)} · Message-ID {d.messageId}
                      <br />
                      SHA-256 isi {d.contentSha256}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
