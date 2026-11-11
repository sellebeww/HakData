// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { z } from "zod";

/** Skema env API. Dipanggil sekali saat boot (createApp): salah konfigurasi = proses berhenti dengan pesan jelas. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    RABBITMQ_URL: z.string().url(),
    JWT_SECRET: z.string().min(32, "minimal 32 karakter"),
    UPLOAD_DIR: z.string().min(1).default("./storage/evidence"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
    MAIL_HOST: z.string().min(1).default("localhost"),
    MAIL_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    // Demo: waktu dipercepat. Hanya dibaca oleh deadlines/deadline.clock.ts.
    DEADLINE_TIME_SCALE: z.coerce.number({ invalid_type_error: "harus angka >= 1" }).min(1, "harus angka >= 1").default(1),
    DEMO_MODE: z.enum(["true", "false"]).default("false"),
    REMINDER_APPROACHING_HOURS: z.coerce.number().positive().default(24),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === "production" && /ganti-dengan|ci-only|changeme/i.test(e.JWT_SECRET))
      ctx.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "masih nilai contoh; buat yang acak (mis. openssl rand -base64 48)" });
    if (e.NODE_ENV === "production" && e.DEADLINE_TIME_SCALE !== 1 && e.DEMO_MODE !== "true")
      ctx.addIssue({ code: "custom", path: ["DEADLINE_TIME_SCALE"], message: "!= 1 di produksi hanya dengan DEMO_MODE=true" });
  });
export type Env = z.infer<typeof envSchema>;

export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const r = envSchema.safeParse(source);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Konfigurasi lingkungan tidak valid:\n${lines}\nLihat .env.example.`);
  }
  return r.data;
}
