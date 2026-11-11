// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { gql } from "@/lib/api";
import { Badge, Empty, ErrorBox, Skeleton, useQuery } from "@/components/ui";

/** Statistik publik: hanya agregat per perusahaan, tanpa identitas. Di bawah ambang pengguna berbeda, server tidak mengembalikan angka apa pun. */
// shortcut: 20 perusahaan pertama (batas kompleksitas GraphQL 300); tambahkan paginasi bila direktori > 20.
const load = async () => {
  const { companies } = await gql<any>(`{companies(take:20){items{slug name}}}`);
  const alias = companies.items.map(
    (c: any, i: number) =>
      `s${i}:companyStats(slug:${JSON.stringify(c.slug)}){requestsRecorded withEvidence responsesRecorded sufficient minSample responseRatio medianResponseHours isDemoData}`,
  );
  const stats = alias.length ? await gql<any>(`{${alias.join(" ")}}`) : {};
  return companies.items.map((c: any, i: number) => ({ ...c, s: stats[`s${i}`] }));
};

export default function Statistik() {
  const { data, error, loading, reload } = useQuery(load, []);
  return (
    <div className="page">
      <h1>Statistik publik</h1>
      <p className="note">
        Angka dicatat sendiri oleh pengguna dan belum diverifikasi independen. Ini bukan peringkat dan bukan penilaian kepatuhan hukum.
        Hanya permintaan yang dikirim lewat email platform yang dihitung, dan angka baru tampil bila berasal dari cukup banyak pengguna
        berbeda agar tidak menyesatkan dan tidak membuka identitas.
      </p>
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading || !data ? (
        <Skeleton h={300} />
      ) : data.length === 0 ? (
        <Empty title="Belum ada data" />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <caption className="sr-only">Statistik respons per perusahaan</caption>
            <thead>
              <tr>
                <th scope="col">Perusahaan</th>
                <th scope="col">Permintaan tercatat</th>
                <th scope="col">Dengan bukti</th>
                <th scope="col">Respons</th>
                <th scope="col">Rasio respons</th>
                <th scope="col">Median waktu respons</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c: any) => (
                <tr key={c.slug}>
                  <th scope="row">
                    <Link href={`/perusahaan/${c.slug}`}>{c.name}</Link> {c.s.isDemoData && <Badge>DATA DEMO</Badge>}
                  </th>
                  <td>{c.s.requestsRecorded ?? "–"}</td>
                  <td>{c.s.withEvidence ?? "–"}</td>
                  <td>{c.s.responsesRecorded ?? "–"}</td>
                  <td>{c.s.sufficient ? `${Math.round(c.s.responseRatio * 100)}%` : `< ${c.s.minSample} pengguna`}</td>
                  <td>{c.s.medianResponseHours != null ? `${c.s.medianResponseHours} jam` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
