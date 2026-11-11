// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
export const config = {
  get jwtSecret() { const s = process.env.JWT_SECRET; if (!s || s.length < 32) throw new Error("JWT_SECRET wajib diisi (min 32 karakter)"); return s; },
  get rabbitUrl() { return process.env.RABBITMQ_URL ?? ""; },
  get uploadDir() { return process.env.UPLOAD_DIR ?? "./storage/evidence"; },
  get webOrigin() { return process.env.WEB_ORIGIN ?? "http://localhost:3000"; },
  get isProd() { return process.env.NODE_ENV === "production"; },
  maxUploadBytes: 10 * 1024 * 1024,
  minStatSample: 10,
};
