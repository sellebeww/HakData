// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { config } from "./common/config";

export async function createApp() {
  config.jwtSecret; // gagal cepat bila secret tidak ada
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }), cookieParser());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  return app;
}
if (require.main === module) {
  createApp().then(async (app) => { app.enableShutdownHooks(); await app.listen(Number(process.env.API_PORT ?? 4000)); });
}
