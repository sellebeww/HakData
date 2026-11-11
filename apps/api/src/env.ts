// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { z } from "zod";

/** Skema env API. Dipanggil sekali saat boot (createApp): salah konfigurasi = proses berhenti dengan pesan jelas. */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "minimal 32 karakter"),
  UPLOAD_DIR: z.string().min(1).default("./storage/evidence"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  MAIL_HOST: z.string().min(1).default("localhost"),
  MAIL_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
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
