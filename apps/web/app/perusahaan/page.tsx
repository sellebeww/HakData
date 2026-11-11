// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { gql } from "@/lib/api";
import { VERIFY } from "@/lib/format";
import { Badge, Empty, ErrorBox, Field, Pager, Skeleton, useQuery } from "@/components/ui";

const TAKE = 9;
export default function Directory() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState("");
  const [status, setStatus] = useState("");
  const [skip, setSkip] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setSkip(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const inds = useQuery(() => gql<{ industries: string[] }>(`{industries}`), []);
  const { data, error, loading, reload } = useQuery(
    () =>
      gql<any>(
        `query($s:String,$i:String,$st:String,$t:Int,$k:Int){companies(search:$s,industry:$i,status:$st,take:$t,skip:$k){total items{slug name brand industry isDemo channels{status}}}}`,
        { s: q || null, i: industry || null, st: status || null, t: TAKE, k: skip },
      ),
    [q, industry, status, skip],
  );
  return (
    <div className="page">
      <h1>Direktori kanal privasi</h1>
      <p className="sub">
        Temukan kanal resmi untuk mengajukan permintaan data. Setiap kanal menampilkan status verifikasinya. Kami tidak menebak alamat
        email.
      </p>
      <div className="filters">
        <Field
          label="Cari perusahaan"
          type="search"
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
          placeholder="Nama atau brand"
        />
        <Field
          label="Industri"
          value={industry}
          onChange={(e: any) => {
            setIndustry(e.target.value);
            setSkip(0);
          }}
          options={[["", "Semua industri"], ...(inds.data?.industries ?? []).map((i) => [i, i] as [string, string])]}
        />
        <Field
          label="Status kanal"
          value={status}
          onChange={(e: any) => {
            setStatus(e.target.value);
            setSkip(0);
          }}
          options={[["", "Semua status"], ...Object.entries(VERIFY).map(([k, v]) => [k, v.label] as [string, string])]}
        />
      </div>
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <div className="grid">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={130} />
          ))}
        </div>
      ) : data!.companies.items.length === 0 ? (
        <Empty title="Tidak ada perusahaan yang cocok" body="Coba kata kunci lain atau hapus filter." />
      ) : (
        <>
          <p className="muted" aria-live="polite">
            {data!.companies.total} perusahaan
          </p>
          <div className="grid">
            {data!.companies.items.map((c: any) => {
              const best = ["OFFICIAL", "COMMUNITY_VERIFIED", "UNVERIFIED"].find((s) => c.channels.some((x: any) => x.status === s));
              return (
                <Link key={c.slug} href={`/perusahaan/${c.slug}`} className="panel">
                  <div className="row between">
                    <h3>{c.name}</h3>
                    {c.isDemo && <Badge tone="demo">DEMO</Badge>}
                  </div>
                  <p>
                    {c.industry}
                    {c.brand ? ` · ${c.brand}` : ""}
                  </p>
                  <div className="row">
                    {best ? <Badge tone={VERIFY[best].tone}>{VERIFY[best].label}</Badge> : <Badge>Belum ada kanal</Badge>}
                    <span className="muted">{c.channels.length} kanal</span>
                  </div>
                </Link>
              );
            })}
          </div>
          <Pager total={data!.companies.total} take={TAKE} skip={skip} onSkip={setSkip} />
        </>
      )}
    </div>
  );
}
