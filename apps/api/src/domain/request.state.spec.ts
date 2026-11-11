// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { assertTransition, canTransition, isEditable, ReqStatus, STATUSES } from "./request.state";

const LEGAL: [ReqStatus, ReqStatus][] = [
  ["DRAFT", "REVIEWED"],
  ["DRAFT", "CLOSED"],
  ["REVIEWED", "DRAFT"],
  ["REVIEWED", "SENT"],
  ["REVIEWED", "CLOSED"],
  ["SENT", "RESPONDED"],
  ["SENT", "COMPLETED"],
  ["SENT", "CLOSED"],
  ["SENT", "OVERDUE"],
  ["OVERDUE", "RESPONDED"],
  ["OVERDUE", "ESCALATED"],
  ["OVERDUE", "COMPLETED"],
  ["OVERDUE", "CLOSED"],
  ["RESPONDED", "RESPONDED"],
  ["RESPONDED", "COMPLETED"],
  ["RESPONDED", "CLOSED"],
  ["ESCALATED", "RESPONDED"],
  ["ESCALATED", "COMPLETED"],
  ["ESCALATED", "CLOSED"],
  ["COMPLETED", "CLOSED"],
];
const key = (a: string, b: string) => `${a}>${b}`;
const legal = new Set(LEGAL.map(([a, b]) => key(a, b)));

describe("state machine: seluruh tabel transisi", () => {
  const pairs = STATUSES.flatMap((a) => STATUSES.map((b) => [a, b] as const));
  it.each(pairs)("%s → %s", (a, b) => {
    const ok = legal.has(key(a, b));
    expect(canTransition(a, b)).toBe(ok);
    if (ok) expect(() => assertTransition(a, b)).not.toThrow();
    else expect(() => assertTransition(a, b)).toThrow(/tidak diizinkan/);
  });
  it("tabel uji mencakup 9 x 9 dan hanya memuat transisi legal yang valid", () => {
    expect(pairs).toHaveLength(81);
    LEGAL.forEach(([a, b]) => expect(STATUSES).toEqual(expect.arrayContaining([a, b])));
  });
  it("CLOSED terminal; status yang belum dijalankan tidak bisa dimasuki", () => {
    STATUSES.forEach((s) => expect(canTransition("CLOSED", s)).toBe(false));
    for (const dead of ["ACKNOWLEDGED"] as const)
      STATUSES.forEach((s) => expect(canTransition(s, dead) || canTransition(dead, s)).toBe(false));
  });
  it("OVERDUE hanya dimasuki dari SENT (pewaktu), dan bukan jalan buntu bagi pengguna", () => {
    STATUSES.filter((s) => canTransition(s, "OVERDUE")).forEach((s) => expect(s).toBe("SENT"));
    expect(["RESPONDED", "COMPLETED", "CLOSED"].every((to) => canTransition("OVERDUE", to as ReqStatus))).toBe(true);
    expect(isEditable("OVERDUE")).toBe(false);
  });
  it("ESCALATED hanya dimasuki dari OVERDUE", () => {
    STATUSES.filter((s) => canTransition(s, "ESCALATED")).forEach((s) => expect(s).toBe("OVERDUE"));
  });
  it("status asing ditolak, bukan melempar TypeError", () => expect(canTransition("NGAWUR" as never, "DRAFT")).toBe(false));
  it("hanya DRAFT dan REVIEWED yang dapat disunting", () => expect(STATUSES.filter((s) => isEditable(s))).toEqual(["DRAFT", "REVIEWED"]));
});
