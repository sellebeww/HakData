// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import * as amqp from "amqplib";
import { z } from "zod";
import { config } from "../common/config";
import { LADDER, Level, nextStep, pickLevel, RETRY } from "../domain/delay-ladder";

/** Pesan = ID saja (ARCHITECTURE 4.3): tanpa PII, tanpa waktu, tanpa status. Konsumen selalu membaca keadaan terbaru dari DB. */
const dueSchema = z.object({ reminderId: z.string().min(1), kind: z.string().min(1), attempt: z.number().int().min(0) });
export type Due = z.infer<typeof dueSchema>;
/** Handler boleh meminta pesan ditunda lagi (datang terlalu cepat); selain itu sukses = ack. Melempar = retry berjenjang. */
export type Handled = void | { redeliverInMs: number };
export type RabbitOptions = { prefix?: string; ladder?: readonly Level[]; retry?: readonly Level[] };

const PREFETCH = 10;

/**
 * Topologi (ARCHITECTURE 4.1): delay(direct) -> wait.<tingkat> (TTL tetap, tanpa consumer) --DLX--> due(direct) -> due.reminders -> consumer.
 * Gagal -> retry(direct) -> retry.<tingkat> (TTL) --DLX--> due. Lewat batas percobaan atau pesan rusak -> due.reminders.failed (DLQ).
 * Koneksi malas dan pulih otomatis. Broker mati TIDAK menghilangkan data: pesan menunggu di tabel OutboxEvent.
 */
@Injectable()
export class RabbitService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger("Rabbit");
  private conn: any = null;
  private ch: amqp.ConfirmChannel | null = null;
  private connecting: Promise<amqp.ConfirmChannel | null> | null = null;
  private consumerTag?: string;
  private subscribing = false;
  private closing = false;
  private handler?: (m: Due) => Promise<Handled>;
  private inflight = new Set<Promise<void>>();
  private ladder: readonly Level[];
  private retry: readonly Level[];
  readonly names;

  constructor(opts: RabbitOptions = {}) {
    const p = opts.prefix ?? process.env.RABBIT_PREFIX ?? "hd"; // dibaca saat dibuat: test memakai prefix sendiri
    this.ladder = opts.ladder ?? LADDER;
    this.retry = opts.retry ?? RETRY;
    const waits = Object.fromEntries(this.ladder.map((l) => [l.label, `${p}.wait.${l.label}`]));
    const retries = Object.fromEntries(this.retry.map((l) => [l.label, `${p}.retry.${l.label}`]));
    const n = {
      delay: `${p}.delay`,
      due: `${p}.due`,
      retry: `${p}.retry`,
      dueQ: `${p}.due.reminders`,
      failed: `${p}.due.reminders.failed`,
    };
    this.names = {
      prefix: p,
      retryLevels: this.retry,
      ...n,
      waits,
      retries,
      queues: [...Object.values(waits), ...Object.values(retries), n.dueQ, n.failed],
      exchanges: [n.delay, n.due, n.retry],
    };
  }

  async onModuleInit() {
    await this.channel(); // deklarasi topologi saat boot; broker mati bukan alasan gagal boot (outbox menahan pesan)
  }
  channel(): Promise<amqp.ConfirmChannel | null> {
    if (this.closing) return Promise.resolve(null);
    return this.ch ? Promise.resolve(this.ch) : (this.connecting ??= this.connect().finally(() => (this.connecting = null)));
  }
  /** Untuk /health: true bila broker terjangkau (mencoba menyambung bila belum). */
  async ping(): Promise<boolean> {
    return (await this.channel()) !== null;
  }

  /** Idempoten: assert* dengan argumen yang sama tidak berefek bila sudah ada. Mengubah argumen queue = PRECONDITION_FAILED (sengaja, jangan diam-diam). */
  async assertTopology(ch: amqp.Channel) {
    const n = this.names;
    for (const e of n.exchanges) await ch.assertExchange(e, "direct", { durable: true });
    const ttlQueue = (l: Level) => ({
      durable: true,
      arguments: { "x-message-ttl": l.ms, "x-dead-letter-exchange": n.due, "x-dead-letter-routing-key": "due" },
    });
    for (const l of this.ladder) {
      await ch.assertQueue(n.waits[l.label], ttlQueue(l));
      await ch.bindQueue(n.waits[l.label], n.delay, `wait.${l.label}`);
    }
    // nack(requeue=false) tanpa publish retry eksplisit tetap tidak hilang: jatuh ke tingkat retry pertama
    await ch.assertQueue(n.dueQ, {
      durable: true,
      arguments: { "x-dead-letter-exchange": n.retry, "x-dead-letter-routing-key": `retry.${this.retry[0].label}` },
    });
    await ch.bindQueue(n.dueQ, n.due, "due");
    for (const l of this.retry) {
      await ch.assertQueue(n.retries[l.label], ttlQueue(l));
      await ch.bindQueue(n.retries[l.label], n.retry, `retry.${l.label}`);
    }
    await ch.assertQueue(n.failed, { durable: true });
  }

  private async connect() {
    if (!config.rabbitUrl) return null;
    try {
      const conn: any = await amqp.connect(config.rabbitUrl);
      conn.on("error", () => undefined);
      const reset = () => {
        if (this.conn === conn) this.conn = this.ch = null;
        this.consumerTag = undefined;
      };
      conn.on("close", reset);
      const ch: amqp.ConfirmChannel = await conn.createConfirmChannel();
      ch.on("error", () => undefined);
      ch.on("close", reset);
      await this.assertTopology(ch);
      if (this.closing) {
        await conn.close().catch(() => undefined);
        return null;
      }
      this.conn = conn;
      this.ch = ch;
      return ch;
    } catch (e) {
      this.log.warn(`RabbitMQ tidak tersedia: ${(e as Error).message}`);
      return null;
    }
  }

  private confirm(ch: amqp.ConfirmChannel, exchange: string, key: string, body: Buffer | object) {
    const content = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    return new Promise<void>((res, rej) =>
      ch.publish(exchange, key, content, { persistent: true, contentType: "application/json" }, (e: unknown) => (e ? rej(e) : res())),
    );
  }
  private route(remainingMs: number): [string, string] {
    const l = pickLevel(remainingMs, this.ladder);
    return l ? [this.names.delay, `wait.${l.label}`] : [this.names.due, "due"];
  }
  /** Terbitkan pesan dengan publisher confirm ke tingkat tunda yang sesuai sisa waktu. false = broker tak tersedia (pemanggil menyimpan di outbox). */
  async publishDelay(m: Due, remainingMs: number): Promise<boolean> {
    const ch = await this.channel();
    if (!ch) return false;
    try {
      await this.confirm(ch, ...this.route(remainingMs), m);
      return true;
    } catch (e) {
      this.log.warn(`Publish gagal: ${(e as Error).message}`);
      return false;
    }
  }

  /** Idempoten: dipanggil berkali-kali (juga setelah sambung ulang) tidak membuat consumer ganda. */
  async consume(handler: (m: Due) => Promise<Handled>) {
    this.handler = handler;
    if (this.consumerTag || this.subscribing || this.closing) return;
    this.subscribing = true;
    try {
      const ch = await this.channel();
      if (!ch || this.consumerTag) return;
      await ch.prefetch(PREFETCH);
      this.consumerTag = (await ch.consume(this.names.dueQ, (m) => m && this.track(this.process(ch, m)))).consumerTag;
    } finally {
      this.subscribing = false;
    }
  }
  private track(p: Promise<void>) {
    this.inflight.add(p);
    void p.finally(() => this.inflight.delete(p));
  }

  /** Ack HANYA setelah efeknya (atau jalur retry/DLQ-nya) terkonfirmasi. Satu pesan di-ack atau di-nack tepat sekali. */
  private async process(ch: amqp.ConfirmChannel, msg: amqp.ConsumeMessage) {
    let body: Due;
    try {
      body = dueSchema.parse(JSON.parse(msg.content.toString()));
    } catch {
      return this.settle(ch, msg, () => this.confirm(ch, "", this.names.failed, msg.content)); // pesan rusak: tidak ada gunanya diulang
    }
    try {
      const r = await this.handler!(body);
      if (r && r.redeliverInMs !== undefined) await this.confirm(ch, ...this.route(r.redeliverInMs), body);
      ch.ack(msg);
    } catch (e) {
      this.log.warn(`Handler gagal reminder=${body.reminderId} percobaan=${body.attempt}: ${(e as Error).message}`);
      const step = nextStep(body.attempt, this.retry);
      await this.settle(ch, msg, () =>
        step.kind === "dead"
          ? this.confirm(ch, "", this.names.failed, body)
          : this.confirm(ch, this.names.retry, `retry.${step.level.label}`, { ...body, attempt: step.attempt }),
      );
    }
  }
  private async settle(ch: amqp.ConfirmChannel, msg: amqp.ConsumeMessage, publish: () => Promise<void>) {
    try {
      await publish();
      ch.ack(msg);
    } catch {
      try {
        ch.nack(msg, false, false); // DLX queue due menampungnya di tingkat retry pertama
      } catch {
        /* kanal sudah mati: broker mengembalikan pesan tak ter-ack ke queue */
      }
    }
  }

  /** Berhenti menerima pesan baru, tunggu yang sedang diproses selesai dan ter-ack, baru tutup kanal dan koneksi. */
  async shutdown(timeoutMs = 10_000) {
    this.closing = true;
    await this.connecting?.catch(() => undefined);
    const { ch, conn, consumerTag } = this;
    try {
      if (ch && consumerTag) await ch.cancel(consumerTag);
    } catch {
      /* kanal sudah mati */
    }
    this.consumerTag = undefined;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([Promise.allSettled([...this.inflight]), new Promise((r) => (timer = setTimeout(r, timeoutMs)))]);
    clearTimeout(timer); // jangan menahan proses keluar
    try {
      await ch?.close();
      await conn?.close();
    } catch {
      /* sudah tertutup */
    }
    this.ch = this.conn = null;
  }
  async onModuleDestroy() {
    await this.shutdown();
  }
}
