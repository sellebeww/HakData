// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// Satu-satunya tempat yang membaca DEADLINE_TIME_SCALE. Skala diterapkan SEKALI, saat dueAt/fireAt dihitung dan disimpan;
// sesudah itu seluruh sistem (DB, broker, UI) bekerja dengan waktu nyata hasil skala.
export function timeScale(): number {
  const raw = process.env.DEADLINE_TIME_SCALE;
  if (raw === undefined || raw === "") return 1;
  const n = Number(raw);
  // keras, bukan fallback ke 1: salah ketik tidak boleh diam-diam mengubah tenggat
  if (!Number.isFinite(n) || n < 1) throw new Error(`DEADLINE_TIME_SCALE tidak valid: "${raw}" (angka >= 1)`);
  return n;
}
export const scaled = (ms: number) => Math.round(ms / timeScale());
export function approachingHours(): number {
  const raw = process.env.REMINDER_APPROACHING_HOURS;
  if (raw === undefined || raw === "") return 24;
  const n = Number(raw);
  // keras, sama seperti timeScale: salah ketik tidak boleh diam-diam menggeser jadwal pengingat
  if (!Number.isFinite(n) || n <= 0) throw new Error(`REMINDER_APPROACHING_HOURS tidak valid: "${raw}" (angka > 0)`);
  return n;
}
/** Lebar jendela "menjelang tenggat" dalam ms pada skala tertentu (skala disimpan per Deadline agar tampilan konsisten). */
export const approachingMs = (scale = timeScale()) => Math.round((approachingHours() * 3_600_000) / scale);
