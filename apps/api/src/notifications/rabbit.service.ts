// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import * as amqp from "amqplib";
import { config } from "../common/config";

const P = process.env.RABBIT_PREFIX ?? "hakdata";
export const Q = { main: `${P}.reminders`, retry: `${P}.reminders.retry`, failed: `${P}.reminders.failed` };
const EX = { events: `${P}.events`, retry: `${P}.retry` };
export const MAX_ATTEMPTS = 5;

/** Koneksi RabbitMQ dibuat malas dan pulih otomatis. Broker mati TIDAK menghilangkan data: pesan menunggu di tabel OutboxEvent. */
@Injectable()
export class RabbitService implements OnModuleDestroy {
  private log = new Logger("Rabbit");
  private conn: any = null;
  private ch: amqp.ConfirmChannel | null = null;
  private connecting: Promise<amqp.ConfirmChannel | null> | null = null;
  private consumerTag?: string;

  channel() {
    return this.ch ? Promise.resolve(this.ch) : (this.connecting ??= this.connect().finally(() => (this.connecting = null)));
  }
  /** Untuk /health: true bila broker terjangkau (mencoba menyambung bila belum). */
  async ping(): Promise<boolean> {
    return (await this.channel()) !== null;
  }
  private async connect() {
    if (!config.rabbitUrl) return null;
    try {
      const conn: any = await amqp.connect(config.rabbitUrl);
      conn.on("error", () => undefined);
      conn.on("close", () => {
        this.conn = null;
        this.ch = null;
        this.consumerTag = undefined;
      });
      const ch = await conn.createConfirmChannel();
      await ch.assertExchange(EX.events, "direct", { durable: true });
      await ch.assertExchange(EX.retry, "direct", { durable: true });
      await ch.assertQueue(Q.main, {
        durable: true,
        arguments: { "x-dead-letter-exchange": EX.retry, "x-dead-letter-routing-key": "reminder.due" },
      });
      await ch.assertQueue(Q.retry, {
        durable: true,
        arguments: { "x-message-ttl": 30_000, "x-dead-letter-exchange": EX.events, "x-dead-letter-routing-key": "reminder.due" },
      });
      await ch.assertQueue(Q.failed, { durable: true });
      await ch.bindQueue(Q.main, EX.events, "reminder.due");
      await ch.bindQueue(Q.retry, EX.retry, "reminder.due");
      this.conn = conn;
      this.ch = ch;
      return ch;
    } catch (e) {
      this.log.warn(`RabbitMQ tidak tersedia: ${(e as Error).message}`);
      return null;
    }
  }
  async publish(payload: object): Promise<boolean> {
    const ch = await this.channel();
    if (!ch) return false;
    try {
      await new Promise<void>((res, rej) =>
        ch.publish(
          EX.events,
          "reminder.due",
          Buffer.from(JSON.stringify(payload)),
          { persistent: true, contentType: "application/json" },
          (e: unknown) => (e ? rej(e) : res()),
        ),
      );
      return true;
    } catch (e) {
      this.log.warn(`Publish gagal: ${(e as Error).message}`);
      return false;
    }
  }
  async consume(handler: (p: any) => Promise<void>) {
    const ch = await this.channel();
    if (!ch || this.consumerTag) return;
    this.consumerTag = (
      await ch.consume(Q.main, async (msg: amqp.ConsumeMessage | null) => {
        if (!msg) return;
        try {
          await handler(JSON.parse(msg.content.toString()));
          ch.ack(msg);
        } catch (e) {
          const deaths = ((msg.properties.headers?.["x-death"] as any[]) ?? []).reduce((n, d) => n + Number(d.count ?? 0), 0);
          this.log.warn(`Handler gagal (percobaan ${deaths + 1}): ${(e as Error).message}`);
          if (deaths + 1 >= MAX_ATTEMPTS) {
            ch.sendToQueue(Q.failed, msg.content, { persistent: true });
            ch.ack(msg);
          } else ch.nack(msg, false, false); // dead-letter -> retry queue (TTL) -> kembali
        }
      })
    ).consumerTag;
  }
  async onModuleDestroy() {
    try {
      await this.ch?.close();
      await this.conn?.close();
    } catch {
      /* sudah tertutup */
    }
  }
}
