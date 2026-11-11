// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
/** Kontrak yang dipakai bersama API dan web. Hanya tipe/konstanta murni, tanpa dependensi runtime. */

/** Kode error GraphQL (lihat docs/SCHEMA_DESIGN.md, ErrorCode). */
export const ERROR_CODES = [
  "BAD_USER_INPUT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_TRANSITION",
  "RATE_LIMITED",
  "INTERNAL_SERVER_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Bentuk respons GET /health. */
export interface HealthResponse {
  status: "ok" | "degraded";
  checks: { db: "up" | "down"; rabbitmq: "up" | "down" };
}
