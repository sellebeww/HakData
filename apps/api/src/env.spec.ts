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
