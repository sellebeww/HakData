// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
export type ReqStatus = "DRAFT" | "REVIEWED" | "SENT" | "RESPONDED" | "COMPLETED" | "CLOSED";
const T: Record<ReqStatus, ReqStatus[]> = {
  DRAFT: ["REVIEWED", "CLOSED"],
  REVIEWED: ["DRAFT", "SENT", "CLOSED"],
  SENT: ["RESPONDED", "COMPLETED", "CLOSED"],
  RESPONDED: ["RESPONDED", "COMPLETED", "CLOSED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
};
export const canTransition = (from: ReqStatus, to: ReqStatus) => T[from].includes(to);
export function assertTransition(from: ReqStatus, to: ReqStatus) {
  if (!canTransition(from, to)) throw new Error(`Perubahan status ${from} → ${to} tidak diizinkan`);
}
export const isEditable = (s: ReqStatus) => s === "DRAFT" || s === "REVIEWED";
