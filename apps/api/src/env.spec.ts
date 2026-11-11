// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { validateEnv } from "./env";

const ok = {
  DATABASE_URL: "postgresql://u:p@localhost:5433/db",
  RABBITMQ_URL: "amqp://u:p@localhost:5673",
  JWT_SECRET: "x".repeat(32),
};

describe("validateEnv", () => {
  it("menerima konfigurasi minimal dan mengisi default", () => {
    const e = validateEnv(ok);
    expect(e.API_PORT).toBe(4000);
    expect(e.MAIL_PORT).toBe(1025);
  });
  it("gagal cepat dengan pesan per variabel", () => {
    expect(() => validateEnv({ ...ok, JWT_SECRET: "pendek" })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...ok, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...ok, API_PORT: "abc" })).toThrow(/API_PORT/);
  });
});

describe("validateEnv: pengaman skala waktu (ARCHITECTURE 4.2, STRIDE E)", () => {
  it("default: skala 1, bukan mode demo", () => {
    const e = validateEnv(ok);
    expect(e.DEADLINE_TIME_SCALE).toBe(1);
    expect(e.DEMO_MODE).toBe("false");
  });
  it("pengembangan boleh mempercepat waktu", () =>
    expect(validateEnv({ ...ok, NODE_ENV: "development", DEADLINE_TIME_SCALE: "1440" }).DEADLINE_TIME_SCALE).toBe(1440));
  it("produksi dengan SCALE != 1 ditolak kecuali DEMO_MODE=true", () => {
    expect(() => validateEnv({ ...ok, NODE_ENV: "production", DEADLINE_TIME_SCALE: "1440" })).toThrow(/DEMO_MODE/);
    expect(validateEnv({ ...ok, NODE_ENV: "production", DEADLINE_TIME_SCALE: "1440", DEMO_MODE: "true" }).DEADLINE_TIME_SCALE).toBe(1440);
  });
  it("produksi dengan SCALE=1 jalan normal", () => expect(validateEnv({ ...ok, NODE_ENV: "production" }).DEADLINE_TIME_SCALE).toBe(1));
  it("produksi menolak JWT_SECRET contoh dari .env.example; dev tetap boleh", () => {
    const sample = "ganti-dengan-string-acak-minimal-32-karakter";
    expect(() => validateEnv({ ...ok, NODE_ENV: "production", JWT_SECRET: sample })).toThrow(/JWT_SECRET.*contoh/);
    expect(validateEnv({ ...ok, JWT_SECRET: sample }).JWT_SECRET).toBe(sample);
  });
  it.each(["0", "-1", "abc", "0.5"])("SCALE %p ditolak", (v) =>
    expect(() => validateEnv({ ...ok, DEADLINE_TIME_SCALE: v })).toThrow(/DEADLINE_TIME_SCALE/),
  );
});
