// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// Kode murni: tanpa NestJS/Prisma, diuji sendiri di request.state.spec.ts.
export const STATUSES = ["DRAFT", "REVIEWED", "SENT", "ACKNOWLEDGED", "RESPONDED", "OVERDUE", "ESCALATED", "COMPLETED", "CLOSED"] as const;
export type ReqStatus = (typeof STATUSES)[number];
/**
 * Alur berjalan (D-003 belum disetujui): DRAFT → REVIEWED → SENT → RESPONDED → COMPLETED → CLOSED.
 * OVERDUE dimasuki dari SENT hanya oleh pewaktu (applyOverdue). ESCALATED hanya dari OVERDUE, oleh pengguna (escalateRequest). ACKNOWLEDGED belum dijalankan: tanpa transisi masuk maupun keluar.
 * Record<ReqStatus,...> membuat TypeScript menolak status baru yang belum diberi baris.
 */
const T: Record<ReqStatus, readonly ReqStatus[]> = {
  DRAFT: ["REVIEWED", "CLOSED"],
  REVIEWED: ["DRAFT", "SENT", "CLOSED"],
  SENT: ["RESPONDED", "OVERDUE", "COMPLETED", "CLOSED"],
  ACKNOWLEDGED: [],
  RESPONDED: ["RESPONDED", "COMPLETED", "CLOSED"],
  OVERDUE: ["RESPONDED", "ESCALATED", "COMPLETED", "CLOSED"], // balasan terlambat, atau pengguna mengeskalasi
  ESCALATED: ["RESPONDED", "COMPLETED", "CLOSED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
};
export const canTransition = (from: ReqStatus, to: ReqStatus) => T[from]?.includes(to) ?? false;
export function assertTransition(from: ReqStatus, to: ReqStatus) {
  if (!canTransition(from, to)) throw new Error(`Perubahan status ${from} → ${to} tidak diizinkan`);
}
export const isEditable = (s: ReqStatus) => s === "DRAFT" || s === "REVIEWED";
