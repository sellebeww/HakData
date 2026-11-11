// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { LADDER, MAX_ATTEMPTS, nextStep, pickLevel, RETRY } from "./delay-ladder";
import { computeDueAt, deadlineStatus, planReminders } from "./deadline.engine";

const S = 1000,
  M = 60 * S,
  H = 60 * M,
  D = 24 * H;

describe("pickLevel: tangga tunda (ARCHITECTURE 4.1)", () => {
  it("tangga = 7d, 1d, 1h, 5m, 1m, 10s, 1s (menurun)", () => {
    expect(LADDER.map((l) => l.label)).toEqual(["7d", "1d", "1h", "5m", "1m", "10s", "1s"]);
    expect(LADDER.map((l) => l.ms)).toEqual([7 * D, D, H, 5 * M, M, 10 * S, S]);
  });
  it.each([
    [10 * D, "7d"],
    [7 * D, "7d"],
    [7 * D - 1, "1d"],
    [D, "1d"],
    [2 * H, "1h"],
    [59 * M, "5m"],
    [5 * M, "5m"],
    [90 * S, "1m"],
    [59 * S, "10s"],
    [10 * S, "10s"],
    [9 * S, "1s"],
    [1500, "1s"],
  ])("sisa %i ms memakai wait.%s (tingkat terbesar yang <= sisa)", (ms, label) => expect(pickLevel(ms)?.label).toBe(label));
  it("sisa di bawah tingkat terkecil tetap memakai tingkat terkecil (selisih < 1 dtk dikoreksi cek DB)", () =>
    expect(pickLevel(1)?.label).toBe("1s"));
  it("sisa <= 0 berarti langsung jatuh tempo (null)", () => {
    expect(pickLevel(0)).toBeNull();
    expect(pickLevel(-5000)).toBeNull();
  });
  it("tidak pernah menunda lebih lama dari sisa waktu (kecuali di bawah 1 dtk)", () => {
    for (let ms = 1000; ms < 3 * D; ms += 7919 * 13) expect(pickLevel(ms)!.ms).toBeLessThanOrEqual(ms);
  });
});

describe("nextStep: backoff retry lalu DLQ", () => {
  it("retry 5s, 30s, 2m, 10m lalu dead-letter pada percobaan ke-5", () => {
    expect(RETRY.map((r) => r.label)).toEqual(["5s", "30s", "2m", "10m"]);
    expect(MAX_ATTEMPTS).toBe(5);
    expect(nextStep(0)).toEqual({ kind: "retry", level: RETRY[0], attempt: 1 });
    expect(nextStep(1)).toEqual({ kind: "retry", level: RETRY[1], attempt: 2 });
    expect(nextStep(2)).toEqual({ kind: "retry", level: RETRY[2], attempt: 3 });
    expect(nextStep(3)).toEqual({ kind: "retry", level: RETRY[3], attempt: 4 });
    expect(nextStep(4)).toEqual({ kind: "dead" });
    expect(nextStep(99)).toEqual({ kind: "dead" });
  });
});

describe("DEADLINE_TIME_SCALE pada mesin tenggat (fungsi murni, skala diberikan pemanggil)", () => {
  const sent = new Date("2026-11-11T00:00:00Z");
  const rule = { durationHours: 72, calcMethod: "CALENDAR_HOURS", status: "VERIFIED" as const };
  it("tanpa skala perilaku lama tidak berubah", () => {
    expect(computeDueAt(rule, sent)!.getTime() - sent.getTime()).toBe(72 * H);
    expect(computeDueAt(rule, sent, 1)!.getTime() - sent.getTime()).toBe(72 * H);
  });
  it("SCALE=1440: 72 jam menjadi 3 menit", () => expect(computeDueAt(rule, sent, 1440)!.getTime() - sent.getTime()).toBe(3 * M));
  it("aturan belum terverifikasi tetap tanpa tenggat pada skala berapa pun", () =>
    expect(computeDueAt({ ...rule, status: "NOT_VERIFIED" }, sent, 1440)).toBeNull());
  it("pengingat: T-24j, T-0, dan follow-up ikut diskalakan", () => {
    const due = computeDueAt(rule, sent, 1440)!;
    const by = (k: string, ps: ReturnType<typeof planReminders>) => ps.find((p) => p.kind === k)!.fireAt.getTime();
    const ps = planReminders(sent, due, 14, { scale: 1440 });
    expect(by("PASSED", ps)).toBe(due.getTime());
    expect(by("APPROACHING", ps)).toBe(due.getTime() - M); // 24 jam / 1440 = 1 menit
    expect(by("FOLLOW_UP", ps)).toBe(sent.getTime() + 14 * M); // 14 hari / 1440 = 14 menit
  });
  it("jendela 'menjelang' dapat dikonfigurasi", () => {
    const due = new Date(sent.getTime() + 72 * H);
    const ps = planReminders(sent, due, 14, { approachingHours: 12 });
    expect(ps.find((p) => p.kind === "APPROACHING")!.fireAt.getTime()).toBe(due.getTime() - 12 * H);
  });
  it("tanpa tenggat hanya ada FOLLOW_UP", () => expect(planReminders(sent, null, 14).map((p) => p.kind)).toEqual(["FOLLOW_UP"]));
  it("status 'menjelang tenggat' memakai jendela yang diskalakan", () => {
    const d = { dueAt: new Date(sent.getTime() + 3 * M), completedAt: null, ruleStatus: "VERIFIED" as const };
    expect(deadlineStatus(d, sent, M)).toBe("COUNTDOWN_ACTIVE"); // sisa 3 menit > jendela 1 menit
    expect(deadlineStatus(d, new Date(sent.getTime() + 2.5 * M), M)).toBe("APPROACHING_DEADLINE");
    expect(deadlineStatus(d, new Date(sent.getTime() + 3 * M), M)).toBe("DEADLINE_PASSED");
  });
});
