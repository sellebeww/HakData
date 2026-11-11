// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { responseTiming } from "./response-timing";

const t = (ms: number) => new Date(1_000_000 + ms);
describe("responseTiming", () => {
  it("tepat waktu: selisih dihitung, tidak terlambat", () =>
    expect(responseTiming(t(500), t(0), t(1000))).toEqual({ elapsedMs: 500, lateByMs: 0 }));
  it("tepat di tenggat tidak terlambat", () => expect(responseTiming(t(1000), t(0), t(1000)).lateByMs).toBe(0));
  it("terlambat: selisih dari dueAt", () => expect(responseTiming(t(1800), t(0), t(1000))).toEqual({ elapsedMs: 1800, lateByMs: 800 }));
  it("tanpa tenggat: keterlambatan tidak dihitung", () => expect(responseTiming(t(500), t(0), null).lateByMs).toBeNull());
  it("tanpa titik awal: selisih null", () => expect(responseTiming(t(500), null, null).elapsedMs).toBeNull());
  it("tidak pernah negatif", () => expect(responseTiming(t(-5), t(0), t(10)).elapsedMs).toBe(0));
});
