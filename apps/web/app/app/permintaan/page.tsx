// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { useState } from "react";
import { gql } from "@/lib/api";
import { REQUEST_STATUS } from "@/lib/format";
import { Empty, ErrorBox, Field, Skeleton, useQuery } from "@/components/ui";
import { RequestRow } from "@/components/RequestRow";

export default function MyRequests() {
  const [st, setSt] = useState("");
  const { data, error, loading, reload } = useQuery(() => gql<any>(`{myRequests{id title status rightCode companyName companySlug sentAt dueAt deadlineStatus updatedAt}}`), []);
  if (error) return <div className="page"><ErrorBox error={error} retry={reload} /></div>;
  if (loading || !data) return <div className="page"><Skeleton h={240} /></div>;
  const list = data.myRequests.filter((r: any) => !st || r.status === st);
  return (<div className="page"><div className="row between"><h1>Permintaan saya</h1><Link className="btn btn-primary" href="/app/permintaan/baru">Permintaan baru</Link></div>
    <Field label="Filter status" value={st} onChange={(e: any) => setSt(e.target.value)} options={[["", "Semua"], ...Object.entries(REQUEST_STATUS)]} />
    {list.length === 0 ? <Empty title="Tidak ada permintaan" body="Belum ada yang cocok dengan filter ini." /> : <div className="list">{list.map((r: any) => <RequestRow key={r.id} r={r} />)}</div>}</div>);
}
