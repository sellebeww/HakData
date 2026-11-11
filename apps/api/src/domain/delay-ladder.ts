// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// Kode murni (tanpa DB/MQ): tangga tunda dan backoff retry, ARCHITECTURE 4.1.
const S = 1000,
  M = 60 * S,
  H = 60 * M,
  D = 24 * H;
export type Level = { label: string; ms: number };

/** TTL per-queue tetap (bukan per-pesan) agar tidak ada head-of-line blocking. Menurun. */
export const LADDER: readonly Level[] = [
  { label: "7d", ms: 7 * D },
  { label: "1d", ms: D },
  { label: "1h", ms: H },
  { label: "5m", ms: 5 * M },
  { label: "1m", ms: M },
  { label: "10s", ms: 10 * S },
  { label: "1s", ms: S },
];
export const RETRY: readonly Level[] = [
  { label: "5s", ms: 5 * S },
  { label: "30s", ms: 30 * S },
  { label: "2m", ms: 2 * M },
  { label: "10m", ms: 10 * M },
];
export const MAX_ATTEMPTS = RETRY.length + 1;

/** Tingkat terbesar yang <= sisa. null bila sudah jatuh tempo. Sisa < 1 dtk memakai 1s; selisihnya dikoreksi cek DB di konsumen. */
export function pickLevel(remainingMs: number, ladder: readonly Level[] = LADDER): Level | null {
  if (remainingMs <= 0) return null;
  return ladder.find((l) => l.ms <= remainingMs) ?? ladder[ladder.length - 1];
}

/** `attempt` = nomor percobaan (0-based) yang baru saja gagal. */
export function nextStep(attempt: number, retry: readonly Level[] = RETRY) {
  const next = attempt + 1;
  return next > retry.length ? { kind: "dead" as const } : { kind: "retry" as const, level: retry[next - 1], attempt: next };
}
