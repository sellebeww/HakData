// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Injectable, Logger, Module, OnModuleInit } from "@nestjs/common";
import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Interval, ScheduleModule } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AuthUser, CurrentUser } from "../common/auth";
import { NotificationT } from "../gql/types";
import { RabbitService } from "./rabbit.service";

const REQUEUE_AFTER_MS = 2 * 60_000;
const fmt = (d: Date) => new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(d) + " WIB";

/**
 * Sumber kebenaran = database. Alur: ScheduledReminder (jatuh tempo) -> OutboxEvent (satu transaksi) -> RabbitMQ -> consumer idempoten -> Notification.
 * Rekonsiliasi: pengingat yang di-queue tetapi belum "fired" setelah 2 menit di-queue ulang (consumer mati / pesan hilang).
 */
@Injectable()
export class ReminderService implements OnModuleInit {
  private log = new Logger("Reminders"); private running = false;
  constructor(private prisma: PrismaService, private rabbit: RabbitService) {}
  async onModuleInit() { if (process.env.DISABLE_SCHEDULER !== "1") this.rabbit.consume((p) => this.handle(p.reminderId)).catch(() => undefined); }

  @Interval(15_000) async tick() { if (process.env.DISABLE_SCHEDULER === "1") return; await this.runOnce(); }

  async runOnce() {
    if (this.running) return; this.running = true;
    try { await this.enqueueDue(); await this.publishOutbox(); await this.rabbit.consume((p) => this.handle(p.reminderId)); }
    catch (e) { this.log.error((e as Error).message); } finally { this.running = false; }
  }
  async enqueueDue() {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "ScheduledReminder" WHERE "firedAt" IS NULL AND "fireAt" <= now()
        AND ("queuedAt" IS NULL OR "queuedAt" < now() - ${REQUEUE_AFTER_MS / 1000} * interval '1 second') ORDER BY "fireAt" LIMIT 100 FOR UPDATE SKIP LOCKED`);
      for (const { id } of rows) {
        await tx.scheduledReminder.update({ where: { id }, data: { queuedAt: new Date() } });
        await tx.outboxEvent.create({ data: { type: "reminder.due", payload: { reminderId: id } } });
      }
    });
  }
  async publishOutbox() {
    const events = await this.prisma.outboxEvent.findMany({ where: { publishedAt: null }, orderBy: { createdAt: "asc" }, take: 100 });
    for (const e of events) {
      if (!(await this.rabbit.publish(e.payload as object))) { await this.prisma.outboxEvent.update({ where: { id: e.id }, data: { attempts: { increment: 1 } } }); break; }
      await this.prisma.outboxEvent.update({ where: { id: e.id }, data: { publishedAt: new Date() } });
    }
  }
  /** Idempoten: dedupeKey unik; pemrosesan ulang pesan yang sama tidak membuat notifikasi ganda. */
  async handle(reminderId: string) {
    const r = await this.prisma.scheduledReminder.findUnique({ where: { id: reminderId }, include: { request: { include: { company: true, deadline: true } } } });
    if (!r || r.firedAt) return;
    const q = r.request; const relevant = !q.deletedAt && q.status === "SENT";
    await this.prisma.$transaction(async (tx) => {
      if (relevant) {
        const t = ({
          APPROACHING: { title: `Menjelang estimasi tenggat: ${q.company.name}`, body: `Estimasi tenggat ${q.deadline?.dueAt ? fmt(q.deadline.dueAt) : ""}. Periksa apakah sudah ada balasan dan catat bila ada.` },
          PASSED: { title: `Estimasi tenggat terlewati: ${q.company.name}`, body: "Belum ada respons yang tercatat. Ini hanya estimasi berdasarkan aturan tercatat, bukan putusan bahwa perusahaan melanggar. Anda dapat menyusun surat tindak lanjut." },
          FOLLOW_UP: { title: `Saatnya tindak lanjut: ${q.company.name}`, body: `Sudah ${q.followUpDays} hari sejak dikirim dan belum ada respons tercatat. Ini pengingat pribadi Anda, bukan tenggat hukum.` },
        })[r.kind];
        try { await tx.notification.create({ data: { userId: q.userId, requestId: q.id, type: `REMINDER_${r.kind}`, ...t, dedupeKey: `reminder:${r.id}` } }); }
        catch (e) { if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e; }
        await tx.timelineEvent.create({ data: { requestId: q.id, type: "REMINDER_ISSUED", actor: "SYSTEM", description: `Pengingat dikirim: ${r.kind}` } });
      }
      await tx.scheduledReminder.update({ where: { id: r.id }, data: { firedAt: new Date() } });
    });
  }
}

@Resolver() export class NotificationsResolver {
  constructor(private prisma: PrismaService) {}
  @Query(() => [NotificationT]) notifications(@CurrentUser() u: AuthUser, @Args("take", { type: () => Int, defaultValue: 50 }) take: number) {
    return this.prisma.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: Math.min(take, 100) });
  }
  @Query(() => Int) unreadCount(@CurrentUser() u: AuthUser) { return this.prisma.notification.count({ where: { userId: u.id, readAt: null } }); }
  @Mutation(() => Boolean) async markNotificationRead(@CurrentUser() u: AuthUser, @Args("id") id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: u.id, readAt: null }, data: { readAt: new Date() } }); return true;
  }
  @Mutation(() => Boolean) async markAllNotificationsRead(@CurrentUser() u: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } }); return true;
  }
}
@Module({ imports: [ScheduleModule.forRoot()], providers: [RabbitService, ReminderService, NotificationsResolver], exports: [ReminderService, RabbitService] }) export class NotificationsModule {}
