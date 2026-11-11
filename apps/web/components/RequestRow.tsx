// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import Link from "next/link";
import { DEADLINE_STATUS, REQUEST_STATUS, fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui";

export const RequestRow = ({ r }: { r: any }) => (
  <Link href={`/app/permintaan/${r.id}`} className="panel">
    <div className="row between">
      <strong>{r.title}</strong>
      <Badge tone={r.status === "COMPLETED" ? "ok" : "info"}>{REQUEST_STATUS[r.status]}</Badge>
    </div>
    <div className="row" style={{ marginTop: 8 }}>
      {r.deadlineStatus && <Badge tone={DEADLINE_STATUS[r.deadlineStatus].tone}>{DEADLINE_STATUS[r.deadlineStatus].label}</Badge>}
      {r.dueAt && <span className="muted">Estimasi tenggat {fmtDateTime(r.dueAt)}</span>}
      {!r.sentAt && <span className="muted">Belum dikirim</span>}
    </div>
  </Link>
);
