// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { gql } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { Button, Empty, ErrorBox, Skeleton, useQuery } from "@/components/ui";

export default function Notifications() {
  const { data, error, loading, reload } = useQuery(() => gql<any>(`{notifications{id requestId type title body readAt createdAt}}`), []);
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
  const list = data.notifications as any[];
  return (
    <div className="page">
      <div className="row between">
        <h1>Notifikasi</h1>
        {list.some((n) => !n.readAt) && (
          <Button
            variant="ghost"
            onClick={async () => {
              await gql(`mutation{markAllNotificationsRead}`);
              reload();
            }}
          >
            Tandai semua dibaca
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <Empty title="Belum ada notifikasi" body="Pengingat tenggat dan tindak lanjut akan muncul di sini." />
      ) : (
        <div className="list">
          {list.map((n) => (
            <div key={n.id} className={`panel ${n.readAt ? "" : "unread"}`}>
              <strong>{n.title}</strong>
              <p>{n.body}</p>
              <div className="row">
                <small className="muted">{fmtDateTime(n.createdAt)}</small>
                {n.requestId && (
                  <Link
                    href={`/app/permintaan/${n.requestId}`}
                    onClick={() => gql(`mutation($i:String!){markNotificationRead(id:$i)}`, { i: n.id })}
                  >
                    Buka permintaan
                  </Link>
                )}
                {!n.readAt && (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await gql(`mutation($i:String!){markNotificationRead(id:$i)}`, { i: n.id });
                      reload();
                    }}
                  >
                    Tandai dibaca
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
