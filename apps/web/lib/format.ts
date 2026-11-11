// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
const TZ = "Asia/Jakarta";
export const fmtDateTime = (d: string | Date) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(d)) + " WIB";
export const fmtDate = (d: string | Date) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: TZ }).format(new Date(d));
export const REQUEST_STATUS: Record<string, string> = {
  DRAFT: "Draf",
  REVIEWED: "Siap dikirim",
  SENT: "Terkirim",
  OVERDUE: "Lewat estimasi tenggat",
  ESCALATED: "Dieskalasi",
  RESPONDED: "Ada respons",
  COMPLETED: "Selesai",
  CLOSED: "Ditutup",
};
export const DEADLINE_STATUS: Record<string, { label: string; tone: string }> = {
  COUNTDOWN_ACTIVE: { label: "Hitung mundur aktif", tone: "info" },
  APPROACHING_DEADLINE: { label: "Menjelang tenggat", tone: "warn" },
  DEADLINE_PASSED: { label: "Estimasi tenggat terlewati", tone: "danger" },
  NEEDS_CONFIRMATION: { label: "Perlu konfirmasi", tone: "warn" },
  RULE_NOT_VERIFIED: { label: "Aturan belum terverifikasi", tone: "muted" },
  COMPLETED: { label: "Selesai", tone: "ok" },
};
export const VERIFY: Record<string, { label: string; tone: string }> = {
  OFFICIAL: { label: "Resmi", tone: "ok" },
  COMMUNITY_VERIFIED: { label: "Diverifikasi komunitas", tone: "info" },
  UNVERIFIED: { label: "Belum terverifikasi", tone: "muted" },
};
export const CHANNEL_TYPE: Record<string, string> = {
  PRIVACY_EMAIL: "Email privasi",
  DPO_EMAIL: "Email DPO",
  REQUEST_FORM: "Formulir permintaan data",
  POSTAL_ADDRESS: "Alamat surat",
  PRIVACY_POLICY_URL: "Kebijakan privasi",
};
export const RESPONSE_CAT: Record<string, string> = {
  ACKNOWLEDGED: "Diterima/diakui",
  ADDITIONAL_INFO_REQUESTED: "Meminta informasi tambahan",
  IN_PROGRESS: "Sedang diproses",
  FULFILLED: "Dipenuhi",
  PARTIALLY_FULFILLED: "Dipenuhi sebagian",
  REJECTED: "Ditolak",
  NO_RESPONSE: "Tidak ada respons",
  OTHER: "Lainnya",
};
export const EVIDENCE_SRC: Record<string, string> = {
  USER_UPLOADED: "Dicatat pengguna",
  SYSTEM_RECORDED: "Dicatat sistem",
  VERIFIED: "Terverifikasi",
  DISPUTED: "Dipersengketakan",
};
export const toLocalInput = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
/** Durasi ms -> "2j 05m 03d" (jam, menit, detik); cocok untuk waktu demo yang dipercepat. */
export const fmtDuration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 3600)}j ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}d`;
};
export const statusTone = (s: string) =>
  ({ COMPLETED: "ok", RESPONDED: "ok", OVERDUE: "danger", ESCALATED: "warn", CLOSED: "muted" })[s] ?? "info";
