// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { gql } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, ErrorBox, Skeleton, useQuery } from "@/components/ui";
import { RequestRow } from "@/components/RequestRow";

export default function Dashboard() {
  const { me } = useAuth();
  const { data, error, loading, reload } = useQuery(
    () =>
      Promise.all([
        gql<any>(`{myRequests{id title status rightCode companyName companySlug sentAt dueAt deadlineStatus updatedAt}}`),
        gql<any>(`{unreadCount}`),
      ]),
    [],
  );
  if (error)
    return (
      <div className="page">
        <ErrorBox error={error} retry={reload} />
      </div>
    );
  if (loading || !data)
    return (
      <div className="page">
        <Skeleton h={240} />
      </div>
    );
  const reqs = data[0].myRequests as any[];
  const unread = data[1].unreadCount;
  const act = reqs.filter(
    (r) => ["DEADLINE_PASSED", "APPROACHING_DEADLINE"].includes(r.deadlineStatus) || ["DRAFT", "REVIEWED"].includes(r.status),
  );
  const rest = reqs.filter((r) => !act.includes(r)).slice(0, 5);
  return (
    <div className="page">
      <div className="row between">
        <div>
          <h1>Halo, {me?.name}</h1>
          <p className="sub">Berikut yang perlu perhatianmu sekarang.</p>
        </div>
        <Link className="btn btn-primary" href="/app/permintaan/baru">
          Permintaan baru
        </Link>
      </div>
      {unread > 0 && (
        <Link href="/app/notifikasi" className="panel unread" style={{ marginBottom: 16 }}>
          <strong>{unread} notifikasi belum dibaca</strong>
        </Link>
      )}
      {reqs.length === 0 ? (
        <Empty
          title="Belum ada permintaan"
          body="Mulai dengan memilih perusahaan yang memegang datamu."
          action={
            <Link className="btn btn-primary" href="/perusahaan">
              Cari perusahaan
            </Link>
          }
        />
      ) : (
        <>
          <h2>Perlu tindakan</h2>
          {act.length ? (
            <div className="list">
              {act.map((r) => (
                <RequestRow key={r.id} r={r} />
              ))}
            </div>
          ) : (
            <p className="muted">Tidak ada yang mendesak.</p>
          )}
          {rest.length > 0 && (
            <>
              <h2 style={{ marginTop: 28 }}>Lainnya</h2>
              <div className="list">
                {rest.map((r) => (
                  <RequestRow key={r.id} r={r} />
                ))}
              </div>
            </>
          )}
          <div className="row" style={{ marginTop: 20 }}>
            <Link href="/app/permintaan">Lihat semua permintaan →</Link>
          </div>
        </>
      )}
    </div>
  );
}
