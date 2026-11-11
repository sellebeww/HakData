// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Controller, Get, Module, Res } from "@nestjs/common";
import type { HealthResponse } from "@hakdata/shared";
import type { Response } from "express";
import { Public } from "../common/auth";
import { NotificationsModule } from "../notifications/notifications.module";
import { RabbitService } from "../notifications/rabbit.service";
import { PrismaService } from "../prisma.service";

const TIMEOUT_MS = 2000;
const within = <T>(p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);

@Controller("health")
class HealthController {
  constructor(
    private prisma: PrismaService,
    private rabbit: RabbitService,
  ) {}

  /** 200 bila DB dan RabbitMQ sehat, 503 bila salah satu mati. Tanpa detail error (endpoint publik). */
  @Public()
  @Get()
  async health(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const up = (ok: boolean) => (ok ? ("up" as const) : ("down" as const));
    const [db, mq] = await Promise.all([
      within(this.prisma.$queryRaw`SELECT 1`).then(
        () => true,
        () => false,
      ),
      within(this.rabbit.ping()).catch(() => false),
    ]);
    const ok = db && mq;
    if (!ok) res.status(503);
    return { status: ok ? "ok" : "degraded", checks: { db: up(db), rabbitmq: up(mq) } };
  }
}

@Module({ imports: [NotificationsModule], controllers: [HealthController] })
export class HealthModule {}
