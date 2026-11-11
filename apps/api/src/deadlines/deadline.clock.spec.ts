// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { approachingHours, scaled, timeScale } from "./deadline.clock";

const KEYS = ["DEADLINE_TIME_SCALE", "REMINDER_APPROACHING_HOURS"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => KEYS.forEach((k) => ((saved[k] = process.env[k]), delete process.env[k])));
afterEach(() => KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));

describe("Deadlines.clock: satu-satunya pembaca DEADLINE_TIME_SCALE", () => {
  it("default skala 1 (waktu nyata)", () => {
    expect(timeScale()).toBe(1);
    expect(scaled(72 * 3_600_000)).toBe(72 * 3_600_000);
  });
  it("SCALE=1440: 72 jam menjadi 3 menit, 24 jam menjadi 1 menit", () => {
    process.env.DEADLINE_TIME_SCALE = "1440";
    expect(scaled(72 * 3_600_000)).toBe(180_000);
    expect(scaled(24 * 3_600_000)).toBe(60_000);
  });
  it("string kosong dianggap tidak diatur", () => {
    process.env.DEADLINE_TIME_SCALE = "";
    expect(timeScale()).toBe(1);
  });
  it.each(["0", "-3", "abc", "0.5"])("nilai tidak valid %p ditolak keras, bukan diam-diam dianggap 1", (v) => {
    process.env.DEADLINE_TIME_SCALE = v;
    expect(() => timeScale()).toThrow(/DEADLINE_TIME_SCALE/);
  });
  it("jendela 'menjelang tenggat' default 24 jam, dapat dikonfigurasi", () => {
    expect(approachingHours()).toBe(24);
    process.env.REMINDER_APPROACHING_HOURS = "12";
    expect(approachingHours()).toBe(12);
  });
  it.each(["0", "-1", "abc"])("REMINDER_APPROACHING_HOURS tidak valid %p ditolak keras, bukan diam-diam 24", (v) => {
    process.env.REMINDER_APPROACHING_HOURS = v;
    expect(() => approachingHours()).toThrow(/REMINDER_APPROACHING_HOURS/);
  });
});
