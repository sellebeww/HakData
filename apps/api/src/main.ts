// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { config } from "./common/config";
import { validateEnv } from "./env";

export async function createApp() {
  validateEnv(); // gagal cepat bila konfigurasi salah
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
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
