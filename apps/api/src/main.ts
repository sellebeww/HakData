// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { config } from "./common/config";
import { validateEnv } from "./env";

export async function createApp() {
  validateEnv(); // gagal cepat bila konfigurasi salah
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["error", "warn", "log"] });
  // Browser masuk lewat proxy Next (/api). Tanpa ini req.ip = IP proxy, sehingga semua pengguna berbagi satu kuota rate limit.
  // Hanya X-Forwarded-For dari alamat privat/loopback yang dipercaya; klien publik yang langsung ke API tidak bisa memalsukannya.
  // TRUST_PROXY angka = jumlah hop (paling ketat bila topologi diketahui, mis. 1 = hanya Next); selain itu daftar alamat/preset Express.
  const tp = process.env.TRUST_PROXY || "loopback, linklocal, uniquelocal";
  app.set("trust proxy", /^\d+$/.test(tp) ? Number(tp) : tp);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }), cookieParser());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  return app;
}
if (require.main === module) {
  createApp().then(async (app) => {
    app.enableShutdownHooks();
    await app.listen(validateEnv().API_PORT);
  });
}
