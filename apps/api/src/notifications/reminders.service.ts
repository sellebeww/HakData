// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { Mailer } from "../common/mailer";
import { config } from "../common/config";
import { Due, Handled, RabbitService } from "./rabbit.service";

type Tx = Prisma.TransactionClient;
const fmt = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(d) + " WIB";

const RECONCILE_LOCK = 5_100_501; // kunci advisory pg: satu pelaksana rekonsiliasi pada satu waktu
const BATCH = 200;
const OUTBOX_BATCH = 50;
const MAX_OUTBOX_BATCHES = 20;
const GRACE_MS = 30_000; // beri jalur broker kesempatan dulu sebelum rekonsiliator turun tangan
const REQUEUE_AFTER_MS = 2 * 60_000;
const EMAIL_LEASE_MS = 5 * 60_000; // > timeout SMTP (8 dtk) dengan margin lebar
/** Status permintaan yang masih relevan bagi tiap jenis pengingat. RESPONDED/CLOSED/COMPLETED tidak pernah memicu apa pun. */
const ACTIVE: Record<string, readonly string[]> = {
  APPROACHING: ["SENT", "ACKNOWLEDGED"],
  PASSED: ["SENT", "ACKNOWLEDGED"],
  FOLLOW_UP: ["SENT", "ACKNOWLEDGED", "OVERDUE"],
};
const PENDING = ["SENT", "ACKNOWLEDGED", "OVERDUE"];

/**
 * Sumber kebenaran = database. Alur (ARCHITECTURE 2, 4, 5):
 *  recordSent -> Reminder + OutboxEvent (satu transaksi) -> publishOutbox -> hd.delay (tangga) -> DLX -> due.reminders -> onDue -> applyReminder.
 * `applyReminder` dan `applyOverdue` dipakai bersama oleh konsumen dan rekonsiliator, sehingga jalur normal dan jalur pemulihan tidak bisa berbeda perilaku.
 */
@Injectable()
export class ReminderService implements OnModuleInit {
  private log = new Logger("Reminders");
  private busy = { publish: false, reconcile: false };
  constructor(
    private prisma: PrismaService,
    private rabbit: RabbitService,
    private mailer: Mailer,
  ) {}

  async onModuleInit() {
    if (process.env.DISABLE_SCHEDULER !== "1") await this.start().catch(() => undefined);
  }
  /** Pasang consumer (idempoten; juga memasang ulang setelah sambungan broker pulih). */
  async start() {
    await this.rabbit.consume((m) => this.onDue(m));
  }

  @Interval(2_000) async publishTick() {
    if (process.env.DISABLE_SCHEDULER === "1" || this.busy.publish) return;
    this.busy.publish = true;
    try {
      await this.start();
      await this.publishOutbox();
    } catch (e) {
      this.log.error((e as Error).message);
    } finally {
      this.busy.publish = false;
    }
  }
  @Interval(60_000) async reconcileTick() {
    if (process.env.DISABLE_SCHEDULER === "1" || this.busy.reconcile) return;
    this.busy.reconcile = true;
    try {
      const r = await this.reconcile();
      await this.emailPending();
      if (r.overdue || r.requeued) this.log.warn(`Rekonsiliasi memperbaiki: overdue=${r.overdue} diantre-ulang=${r.requeued}`);
    } catch (e) {
      this.log.error((e as Error).message);
    } finally {
      this.busy.reconcile = false;
    }
  }
  /** Satu putaran jalur broker (tanpa rekonsiliasi): pasang consumer + terbitkan outbox. */
  async runOnce() {
    await this.start();
    await this.publishOutbox();
  }

  /** Konsumen: waktu hanya dari DB. Datang terlalu cepat -> minta ditunda lagi (lompat tangga); selebihnya idempoten. */
  async onDue(m: Due): Promise<Handled> {
    const r = await this.prisma.reminder.findUnique({ where: { id: m.reminderId }, select: { fireAt: true, firedAt: true } });
    if (!r || r.firedAt) return; // tidak dikenal / sudah diproses / dihapus: ack tanpa efek
    const remaining = r.fireAt.getTime() - Date.now();
    if (remaining > 0) return { redeliverInMs: remaining };
    await this.applyReminder(m.reminderId);
  }

  /** Idempoten. Hak atas pengingat diklaim lewat conditional update (`firedAt is null`) di dalam transaksi yang sama dengan efeknya. */
  async applyReminder(id: string) {
    await this.applyReminderTx(id);
    await this.emailPending().catch((e) => this.log.warn(`Email pengingat gagal: ${(e as Error).message}`)); // di luar transaksi; DB tetap sumber kebenaran
  }

  /**
   * Kirim email untuk notifikasi pengingat yang belum diemail. Klaim berupa SEWA (`emailClaimedAt`, berlaku EMAIL_LEASE_MS): dua instance
   * tidak mengirim ganda, dan instance yang mati di tengah jalan tidak membuat email hilang selamanya (sewa kedaluwarsa, dicoba lagi).
   * Setelah SMTP menerima, `emailedAt` ditulis lebih dulu, baru bukti kirim: gagal mencatat bukti tidak memicu kirim ulang.
   */
  async emailPending(limit = 50) {
    const leaseExpired = new Date(Date.now() - EMAIL_LEASE_MS);
    const rows = await this.prisma.notification.findMany({
      where: {
        emailedAt: null,
        type: { startsWith: "REMINDER_" },
        OR: [{ emailClaimedAt: null }, { emailClaimedAt: { lt: leaseExpired } }],
      },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    let sent = 0;
    for (const n of rows) {
      const claim = await this.prisma.notification.updateMany({
        where: { id: n.id, emailedAt: null, emailClaimedAt: n.emailClaimedAt },
        data: { emailClaimedAt: new Date() },
      });
      if (claim.count === 0) continue; // instance lain menang
      const link = n.requestId ? `\n\nBuka permintaan: ${config.webOrigin}/app/permintaan/${n.requestId}` : "";
      let receipt;
      try {
        receipt = await this.mailer.send(n.user.email, n.title, `${n.body}${link}`);
      } catch (e) {
        await this.prisma.notification.updateMany({ where: { id: n.id, emailedAt: null }, data: { emailClaimedAt: null } });
        this.log.warn(`Email pengingat ${n.id} gagal: ${(e as Error).message}`);
        continue;
      }
      await this.prisma.notification.update({ where: { id: n.id }, data: { emailedAt: receipt.sentAt } });
      sent++;
      await this.prisma.emailDelivery
        .create({
          data: {
            requestId: n.requestId,
            kind: "REMINDER",
            toAddress: n.user.email,
            subject: n.title,
            messageId: receipt.messageId,
            contentSha256: receipt.contentSha256,
            sentAt: receipt.sentAt,
          },
        })
        .catch((e) => this.log.warn(`Bukti kirim email ${n.id} gagal dicatat: ${(e as Error).message}`));
    }
    return sent;
  }

  private async applyReminderTx(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.reminder.updateMany({
        where: { id, firedAt: null, fireAt: { lte: new Date() } },
        data: { firedAt: new Date() },
      });
      if (claimed.count === 0) return; // pesan ganda, konsumen lain menang, atau belum waktunya
      const { requestId, kind, fireAt } = await tx.reminder.findUniqueOrThrow({
        where: { id },
        select: { requestId: true, kind: true, fireAt: true },
      });
      if (kind === "PASSED" && (await this.applyOverdue(requestId, tx))) return;
      // dibaca SETELAH percobaan overdue: bila penulis lain menang, di sini sudah terlihat OVERDUE
      const q = await tx.privacyRequest.findUniqueOrThrow({ where: { id: requestId }, include: { company: true, deadline: true } });
      if (q.deletedAt || !ACTIVE[kind].includes(q.status)) return; // sudah dibalas/ditutup: tidak ada efek
      const t = {
        APPROACHING: {
          title: `Menjelang estimasi tenggat: ${q.company.name}`,
          body: `Estimasi tenggat ${q.deadline?.dueAt ? fmt(q.deadline.dueAt) : ""}. Periksa apakah sudah ada balasan dan catat bila ada.`,
        },
        PASSED: {
          title: `Estimasi tenggat terlewati: ${q.company.name}`,
          body: "Belum ada respons yang tercatat. Ini hanya estimasi berdasarkan aturan tercatat, bukan putusan bahwa perusahaan melanggar. Anda dapat menyusun surat tindak lanjut.",
        },
        FOLLOW_UP: {
          title: `Saatnya tindak lanjut: ${q.company.name}`,
          body: `Sudah ${q.followUpDays} hari sejak dikirim dan belum ada respons tercatat. Ini pengingat pribadi Anda, bukan tenggat hukum.`,
        },
      }[kind as "APPROACHING" | "PASSED" | "FOLLOW_UP"];
      await tx.notification.createMany({
        // fireAt ikut di kunci: pengingat yang dijadwal ulang (mis. setelah waktu diterima dicatat) memakai ID yang sama tapi harus tetap memberi tahu
        data: [{ userId: q.userId, requestId: q.id, type: `REMINDER_${kind}`, ...t, dedupeKey: `reminder:${id}:${fireAt.getTime()}` }],
        skipDuplicates: true,
      });
      await tx.timelineEvent.create({
        data: { requestId: q.id, type: "REMINDER_ISSUED", actor: "SYSTEM", description: `Pengingat dikirim: ${kind}` },
      });
    });
  }

  /**
   * SENT -> OVERDUE bila (dan hanya bila) ada dueAt dari aturan VERIFIED yang sudah lewat. Idempoten; true bila INI yang mengubah status.
   * Satu-satunya penulis OVERDUE: dipanggil konsumen (PASSED) dan rekonsiliator. Eskalasi tetap keputusan pengguna (ARCHITECTURE 3, aturan 4):
   * sistem memicunya dengan notifikasi + linimasa, bukan memindahkan status ke ESCALATED.
   */
  async applyOverdue(requestId: string, tx?: Tx): Promise<boolean> {
    if (!tx) return this.prisma.$transaction((t) => this.applyOverdue(requestId, t));
    const d = await tx.deadline.findUnique({ where: { requestId }, include: { rule: true, request: { include: { company: true } } } });
    const now = new Date();
    if (!d?.dueAt || d.dueAt > now || d.rule.status !== "VERIFIED") return false; // tidak pernah lebih awal; aturan belum terverifikasi tidak pernah OVERDUE
    const won = await tx.privacyRequest.updateMany({
      where: { id: requestId, status: "SENT", deletedAt: null },
      data: { status: "OVERDUE", overdueAt: now },
    });
    if (won.count === 0) return false; // sudah dibalas/ditutup/OVERDUE
    await tx.timelineEvent.create({
      data: {
        requestId,
        type: "OVERDUE_MARKED",
        actor: "SYSTEM",
        description: `Estimasi tenggat ${fmt(d.dueAt)} terlewati tanpa respons tercatat; status menjadi OVERDUE`,
        metadata: { from: "SENT", to: "OVERDUE", dueAt: d.dueAt.toISOString(), ruleKey: d.rule.ruleKey, ruleVersion: d.rule.version },
      },
    });
    await tx.notification.createMany({
      data: [
        {
          userId: d.request.userId,
          requestId,
          type: "REMINDER_PASSED",
          title: `Estimasi tenggat terlewati: ${d.request.company.name}`,
          body: "Belum ada respons yang tercatat. Ini hanya estimasi berdasarkan aturan tercatat, bukan putusan bahwa perusahaan melanggar. Anda dapat menyusun surat tindak lanjut atau melanjutkan ke eskalasi.",
          dedupeKey: `overdue:${requestId}`,
        },
      ],
      skipDuplicates: true,
    });
    await tx.reminder.updateMany({ where: { requestId, kind: "PASSED", firedAt: null }, data: { firedAt: now } });
    return true;
  }

  /** Terbitkan outbox ke broker (publisher confirm). Menguras backlog per batch; SKIP LOCKED sehingga beberapa instance aman. */
  async publishOutbox(): Promise<number> {
    if (!(await this.rabbit.ping())) return 0;
    let total = 0;
    for (let i = 0; i < MAX_OUTBOX_BATCHES; i++) {
      const b = await this.publishBatch();
      total += b.count;
      if (b.stalled || b.count < OUTBOX_BATCH) break;
    }
    return total;
  }
  private publishBatch() {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; payload: { reminderId?: string } }[]>(
          Prisma.sql`SELECT id, payload FROM "OutboxEvent" WHERE "publishedAt" IS NULL AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${new Date()})
            ORDER BY "createdAt" LIMIT ${OUTBOX_BATCH} FOR UPDATE SKIP LOCKED`,
        );
        for (const row of rows) {
          const r = row.payload.reminderId
            ? await tx.reminder.findUnique({
                where: { id: row.payload.reminderId },
                select: { id: true, kind: true, fireAt: true, firedAt: true },
              })
            : null;
          if (r && !r.firedAt) {
            // sisa waktu dari DB, bukan dari payload
            if (!(await this.rabbit.publishDelay({ reminderId: r.id, kind: r.kind, attempt: 0 }, r.fireAt.getTime() - Date.now()))) {
              await tx.outboxEvent.update({
                where: { id: row.id },
                data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 5_000), lastError: "broker tidak tersedia" },
              });
              return { count: rows.length, stalled: true };
            }
            await tx.reminder.update({ where: { id: r.id }, data: { queuedAt: new Date() } });
          }
          await tx.outboxEvent.update({ where: { id: row.id }, data: { publishedAt: new Date() } });
        }
        return { count: rows.length, stalled: false };
      },
      { timeout: 30_000 },
    );
  }

  /**
   * Jaring pengaman (ARCHITECTURE 5), dikunci pg_advisory_xact_lock:
   * (3) permintaan SENT yang lewat tenggat -> applyOverdue langsung; (2) pengingat jatuh tempo yang tak kunjung diproses -> antre ulang lewat outbox;
   * (1) outbox yang belum terbit -> terbitkan. Aman dijalankan kapan saja dan berulang.
   */
  async reconcile(o: { graceMs?: number; requeueAfterMs?: number } = {}) {
    const graceMs = o.graceMs ?? GRACE_MS;
    const requeueAfterMs = o.requeueAfterMs ?? REQUEUE_AFTER_MS;
    const res = { ran: false, overdue: 0, requeued: 0 };
    const cutoff = new Date(Date.now() - graceMs);
    const stale = new Date(Date.now() - requeueAfterMs);
    // Satu transaksi per batch (komit bertahap): backlog besar setelah broker lama mati tetap maju, alih-alih satu transaksi raksasa
    // yang timeout lalu me-rollback semuanya. Tiap batch mengambil kunci advisory sendiri; null = instance lain sedang merekonsiliasi.
    const batch = (fn: (tx: Tx) => Promise<{ last?: string; size: number; n: number }>) =>
      this.prisma.$transaction(
        async (tx) => {
          const [{ ok }] = await tx.$queryRaw<{ ok: boolean }[]>(Prisma.sql`SELECT pg_try_advisory_xact_lock(${RECONCILE_LOCK}) AS ok`);
          return ok ? fn(tx) : null;
        },
        { timeout: 30_000, maxWait: 10_000 },
      );
    for (let last = ""; ;) {
      const b = await batch(async (tx) => {
        const rows = await tx.deadline.findMany({
          where: {
            dueAt: { lte: cutoff },
            rule: { status: "VERIFIED" },
            request: { status: "SENT", deletedAt: null },
            requestId: { gt: last },
          },
          orderBy: { requestId: "asc" },
          take: BATCH,
          select: { requestId: true },
        });
        let n = 0;
        for (const { requestId } of rows) if (await this.applyOverdue(requestId, tx)) n++;
        return { last: rows.at(-1)?.requestId, size: rows.length, n };
      });
      if (!b) break;
      res.ran = true;
      res.overdue += b.n; // dihitung setelah komit
      if (b.size < BATCH) break;
      last = b.last!;
    }
    for (let last = ""; ;) {
      const b = await batch(async (tx) => {
        const rows = await tx.reminder.findMany({
          where: {
            id: { gt: last },
            firedAt: null,
            fireAt: { lte: cutoff },
            OR: [{ queuedAt: null }, { queuedAt: { lt: stale } }],
            request: { deletedAt: null, status: { in: PENDING as never[] } },
          },
          orderBy: { id: "asc" },
          take: BATCH,
          select: { id: true, kind: true },
        });
        for (const r of rows) {
          await tx.outboxEvent.create({ data: { type: "reminder.due", payload: { reminderId: r.id, kind: r.kind, attempt: 0 } } });
          await tx.reminder.update({ where: { id: r.id }, data: { queuedAt: new Date() } });
        }
        return { last: rows.at(-1)?.id, size: rows.length, n: rows.length };
      });
      if (!b) break;
      res.ran = true;
      res.requeued += b.n;
      if (b.size < BATCH) break;
      last = b.last!;
    }
    if (res.ran) await this.publishOutbox();
    return res;
  }
}
