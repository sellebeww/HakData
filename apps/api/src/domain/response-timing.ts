// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// Kode murni. `since` = awal hitungan tenggat (deadline.startedAt, atau sentAt bila belum ada tenggat). Semua dalam waktu nyata hasil skala.
export interface ResponseTiming {
  elapsedMs: number | null; // sejak `since` sampai balasan diterima
  lateByMs: number | null; // > 0 hanya bila balasan setelah dueAt; null bila tak ada dueAt
}
export function responseTiming(receivedAt: Date, since: Date | null, dueAt: Date | null): ResponseTiming {
  return {
    elapsedMs: since ? Math.max(0, receivedAt.getTime() - since.getTime()) : null,
    lateByMs: dueAt ? Math.max(0, receivedAt.getTime() - dueAt.getTime()) : null,
  };
}
