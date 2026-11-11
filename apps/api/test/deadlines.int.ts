// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// Integrasi dengan Postgres + RabbitMQ NYATA (docker compose / service CI). Tanpa mock broker.
import "./setup";
import * as amqp from "amqplib";
import { INestApplication } from "@nestjs/common";
import { createApp } from "../src/main";
import { PrismaService } from "../src/prisma.service";
import { AuthUser } from "../src/common/auth";
import { RequestsService } from "../src/requests/requests.service";
import { ReminderService } from "../src/notifications/notifications.module";
import { RabbitService, Due } from "../src/notifications/rabbit.service";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 8);
const until = async (fn: () => Promise<unknown>, ms = 20_000) => {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) throw new Error("until: timeout");
    await sleep(50);
  }
};
jest.setTimeout(60_000); // beberapa skenario menunggu waktu nyata (tenggat 3 dtk, backoff)
const PREFIX = `hd_t_${rid()}`;
const D3 = 86_400; // skala: 72 jam menjadi 3 detik, 24 jam menjadi 1 detik
const H80 = 80 * 3_600_000;

let app: INestApplication;
let prisma: PrismaService;
let rabbit: RabbitService;
let reminders: ReminderService;
let requests: RequestsService;
let companyId: string;
let conn: amqp.ChannelModel;
let ch: amqp.Channel;
const extra: RabbitService[] = [];
const depth = async (q: string) => (await ch.checkQueue(q)).messageCount;
const rawSend = (ex: string, key: string, body: Buffer | object) =>
  ch.publish(ex, key, Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)), { persistent: true });

/** Permintaan SENT lewat jalur produksi (RequestsService.recordSent), dengan skala waktu yang dipilih. */
async function sent(o: { scale?: number; sentAgoMs?: number; rightCode?: string } = {}) {
  const user = await prisma.user.create({
    data: { email: `dl${rid()}@test.dev`, passwordHash: "x", name: "Uji", emailVerifiedAt: new Date() },
  });
  const r = await prisma.privacyRequest.create({
    data: {
      userId: user.id,
      companyId,
      rightCode: o.rightCode ?? "ACCESS",
      title: "uji",
      fields: {},
      letterBody: "isi",
      status: "REVIEWED",
    },
  });
  const au: AuthUser = { id: user.id, email: user.email, name: user.name, role: "USER" };
  const prev = process.env.DEADLINE_TIME_SCALE;
  process.env.DEADLINE_TIME_SCALE = String(o.scale ?? 1);
  try {
    await requests.recordSent(au, r.id, { sentVia: "EMAIL", sentAt: new Date(Date.now() - (o.sentAgoMs ?? 0)) });
  } finally {
    if (prev === undefined) delete process.env.DEADLINE_TIME_SCALE;
    else process.env.DEADLINE_TIME_SCALE = prev;
  }
  return { id: r.id, user: au };
}
const req = (id: string) => prisma.privacyRequest.findUniqueOrThrow({ where: { id } });
const rem = (id: string, kind: "APPROACHING" | "PASSED" | "FOLLOW_UP") =>
  prisma.reminder.findFirstOrThrow({ where: { requestId: id, kind } });
const notes = (id: string, type: string) => prisma.notification.count({ where: { requestId: id, type } });
const marked = (id: string) => prisma.timelineEvent.count({ where: { requestId: id, type: "OVERDUE_MARKED" } });
const mk = (retry?: { label: string; ms: number }[]) => {
  const s = new RabbitService({ prefix: `hd_t_${rid()}`, retry: retry ?? [1, 2, 3, 4].map((i) => ({ label: `r${i}`, ms: 100 * i })) });
  extra.push(s);
  return s;
};
const msg = (reminderId = "x"): Due => ({ reminderId, kind: "PASSED", attempt: 0 });
const RECON = { graceMs: 0, requeueAfterMs: 0 };

beforeAll(async () => {
  process.env.RABBIT_PREFIX = PREFIX; // dibaca saat RabbitService dibuat
  conn = await amqp.connect(process.env.RABBITMQ_URL!);
  ch = await conn.createChannel();
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
  rabbit = app.get(RabbitService);
  reminders = app.get(ReminderService);
  requests = app.get(RequestsService, { strict: false });
  companyId = (await prisma.company.findFirstOrThrow({ where: { isDemo: true } })).id;
  await rabbit.ping(); // topologi dideklarasikan saat boot / sambungan pertama
  await reminders.start(); // consumer nyata; pewaktu otomatis dimatikan di test (DISABLE_SCHEDULER)
});
afterAll(async () => {
  await app.close();
  for (const s of [rabbit, ...extra]) {
    for (const q of s.names.queues) await ch.deleteQueue(q).catch(() => undefined);
    for (const e of s.names.exchanges) await ch.deleteExchange(e).catch(() => undefined);
  }
  await conn.close();
});

describe("topologi (ARCHITECTURE 4.1)", () => {
  it("wait-queue per tingkat, due-queue, retry-queue, dan DLQ terpisah ada", async () => {
    const n = rabbit.names;
    expect(Object.keys(n.waits)).toEqual(["7d", "1d", "1h", "5m", "1m", "10s", "1s"]);
    expect(Object.keys(n.retries)).toEqual(["5s", "30s", "2m", "10m"]);
    for (const q of [...Object.values(n.waits), ...Object.values(n.retries), n.dueQ, n.failed]) await ch.checkQueue(q);
    expect(n.failed).not.toBe(n.dueQ);
  });
  it("deklarasi idempoten: diulang, dan oleh proses lain (restart), tidak gagal dan tidak mengubah apa pun", async () => {
    const c = (await rabbit.channel())!;
    await rabbit.assertTopology(c);
    await rabbit.assertTopology(c);
    const before = await depth(rabbit.names.dueQ);
    const again = new RabbitService({ prefix: PREFIX }); // seperti API restart: argumen queue harus identik
    extra.push(again);
    await expect(again.ping()).resolves.toBe(true);
    await again.shutdown();
    expect(await depth(rabbit.names.dueQ)).toBe(before);
  });
  it("pesan di wait-queue kedaluwarsa lewat DLX ke due-queue (TTL tetap per queue)", async () => {
    const s = mk();
    await s.ping();
    await s.publishDelay(msg("ttl-1s"), 1000); // wait.1s
    expect(await depth(s.names.waits["1s"])).toBe(1);
    expect(await depth(s.names.dueQ)).toBe(0);
    await until(async () => (await depth(s.names.dueQ)) === 1, 5000);
    expect(await depth(s.names.waits["1s"])).toBe(0);
    await s.shutdown();
  });
});

describe("penjadwalan saat SENT (satu transaksi)", () => {
  it("DEADLINE_TIME_SCALE: tenggat, pengingat, dan outbox dibuat sesuai konfigurasi", async () => {
    const { id } = await sent({ scale: 1440 });
    const [r, d] = await Promise.all([req(id), prisma.deadline.findUniqueOrThrow({ where: { requestId: id } })]);
    expect(d.timeScale).toBe(1440);
    expect(d.dueAt!.getTime() - r.sentAt!.getTime()).toBe(3 * 60_000); // 72 jam / 1440
    const at = async (k: "APPROACHING" | "PASSED" | "FOLLOW_UP") => (await rem(id, k)).fireAt.getTime();
    expect(await at("PASSED")).toBe(d.dueAt!.getTime()); // T-0
    expect(await at("APPROACHING")).toBe(d.dueAt!.getTime() - 60_000); // T-24j / 1440
    expect(await at("FOLLOW_UP")).toBe(r.sentAt!.getTime() + 14 * 60_000); // 14 hari / 1440
    const rs = await prisma.reminder.findMany({ where: { requestId: id } });
    const events = await prisma.outboxEvent.findMany({
      where: { OR: rs.map((x) => ({ payload: { path: ["reminderId"], equals: x.id } })) },
    });
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(Object.keys(e.payload as object).sort()).toEqual(["attempt", "kind", "reminderId"]); // tanpa PII, tanpa waktu, tanpa status
      expect(e.publishedAt).toBeNull();
    }
  });
});

describe("pesan kedaluwarsa tepat waktu", () => {
  it("SENT menjadi OVERDUE setelah dueAt lewat lewat jalur outbox -> wait-queue -> DLX -> due-queue -> consumer; tidak lebih awal", async () => {
    const { id } = await sent({ scale: D3 }); // dueAt = +3 dtk, APPROACHING = +2 dtk
    const d = await prisma.deadline.findUniqueOrThrow({ where: { requestId: id } });
    expect(d.dueAt!.getTime() - d.startedAt.getTime()).toBe(3000);
    await reminders.publishOutbox(); // TANPA rekonsiliasi: hanya jalur broker yang boleh menyelesaikan ini
    await until(async () => {
      const r = await req(id);
      if (r.status !== "OVERDUE") return false;
      expect(Date.now()).toBeGreaterThanOrEqual(d.dueAt!.getTime()); // tidak pernah terlalu cepat
      return true;
    });
    const r = await req(id);
    expect(r.overdueAt!.getTime()).toBeGreaterThanOrEqual(d.dueAt!.getTime());
    expect(r.overdueAt!.getTime() - d.dueAt!.getTime()).toBeLessThan(2500); // tangga 1 dtk + pemrosesan
    expect(await marked(id)).toBe(1);
    expect(await notes(id, "REMINDER_PASSED")).toBe(1);
    const approaching = await prisma.notification.findFirstOrThrow({ where: { requestId: id, type: "REMINDER_APPROACHING" } });
    expect(approaching.createdAt.getTime()).toBeGreaterThanOrEqual((await rem(id, "APPROACHING")).fireAt.getTime());
    expect(approaching.createdAt.getTime()).toBeLessThan(d.dueAt!.getTime()); // pengingat T-24j datang sebelum tenggat
    const ev = await prisma.timelineEvent.findFirstOrThrow({ where: { requestId: id, type: "OVERDUE_MARKED" } });
    expect(ev.actor).toBe("SYSTEM");
  });
  it("pesan yang datang terlalu cepat dilompatkan ke tingkat berikutnya, bukan dieksekusi; payload palsu diabaikan", async () => {
    const { id } = await sent({ scale: 1 }); // tenggat 72 jam lagi
    const { waits, due } = rabbit.names;
    const [b1, b7] = [await depth(waits["1d"]), await depth(waits["7d"])];
    for (const k of ["APPROACHING", "PASSED", "FOLLOW_UP"] as const)
      rawSend(due, "due", { reminderId: (await rem(id, k)).id, kind: k, attempt: 0 });
    await until(async () => (await depth(waits["1d"])) - b1 === 2 && (await depth(waits["7d"])) - b7 === 1); // 48j, 72j -> 1d; 14 hari -> 7d
    // waktu dalam payload dimanipulasi: tidak mengubah apa pun, waktu hanya dari DB
    rawSend(due, "due", { reminderId: (await rem(id, "PASSED")).id, kind: "PASSED", attempt: 0, dueAt: new Date(0), fireAt: "1970-01-01" });
    await until(async () => (await depth(waits["1d"])) - b1 === 3);
    expect((await req(id)).status).toBe("SENT");
    expect((await prisma.deadline.findUniqueOrThrow({ where: { requestId: id } })).dueAt!.getTime()).toBeGreaterThan(
      Date.now() + 71 * 3_600_000,
    );
    expect((await rem(id, "PASSED")).firedAt).toBeNull();
  });
  it("ID acak (pesan palsu) di-ack tanpa efek dan tanpa retry", async () => {
    await rabbit.publishDelay({ reminderId: `acak-${rid()}`, kind: "PASSED", attempt: 0 }, 0);
    await until(async () => (await depth(rabbit.names.dueQ)) === 0);
    await sleep(300);
    expect(await depth(rabbit.names.failed)).toBe(0);
    for (const q of Object.values(rabbit.names.retries)) expect(await depth(q)).toBe(0);
  });
});

describe("duplikasi pesan tidak menggandakan efek", () => {
  it("pesan yang sama berkali-kali (broker) dan dua penerapan paralel menghasilkan satu OVERDUE, satu notifikasi", async () => {
    const { id } = await sent({ sentAgoMs: H80 }); // tenggat sudah lewat 8 jam
    const passed = await rem(id, "PASSED");
    for (let i = 0; i < 5; i++) await rabbit.publishDelay({ reminderId: passed.id, kind: "PASSED", attempt: 0 }, 0); // duplikat dari broker
    await Promise.all(Array.from({ length: 10 }, () => reminders.applyReminder(passed.id))); // konsumen paralel
    await until(async () => (await rem(id, "PASSED")).firedAt !== null && (await depth(rabbit.names.dueQ)) === 0);
    await sleep(500);
    expect((await req(id)).status).toBe("OVERDUE");
    expect(await marked(id)).toBe(1);
    expect(await notes(id, "REMINDER_PASSED")).toBe(1);
    await expect(reminders.applyOverdue(id)).resolves.toBe(false); // sudah OVERDUE: tidak mengulang
  });
});

describe("pesan hilang dipulihkan rekonsiliator", () => {
  it("queue di-purge: tanpa rekonsiliasi tidak ada yang terjadi; dengan rekonsiliasi (paralel pun) SENT menjadi OVERDUE tepat sekali", async () => {
    const { id } = await sent({ scale: D3 });
    const d = await prisma.deadline.findUniqueOrThrow({ where: { requestId: id } });
    await reminders.publishOutbox();
    for (const q of [...Object.values(rabbit.names.waits), rabbit.names.dueQ, ...Object.values(rabbit.names.retries)])
      await ch.purgeQueue(q); // pesan hilang
    await sleep(Math.max(0, d.dueAt!.getTime() - Date.now()) + 1500);
    expect((await req(id)).status).toBe("SENT"); // terbukti: jalur broker tidak memulihkan
    await Promise.all([reminders.reconcile(RECON), reminders.reconcile(RECON)]);
    const r = await req(id);
    expect(r.status).toBe("OVERDUE");
    expect(r.overdueAt!.getTime()).toBeGreaterThanOrEqual(d.dueAt!.getTime());
    expect(await marked(id)).toBe(1);
    expect(await notes(id, "REMINDER_PASSED")).toBe(1);
    expect((await rem(id, "PASSED")).firedAt).not.toBeNull();
    await reminders.reconcile(RECON); // rekonsiliasi ulang: tidak ada efek tambahan
    expect(await marked(id)).toBe(1);
    expect(await notes(id, "REMINDER_PASSED")).toBe(1);
  });
  it("pengingat yang tertinggal diantre ulang lewat outbox; pengingat usang untuk permintaan OVERDUE tidak menambah notifikasi", async () => {
    const { id } = await sent({ sentAgoMs: H80 });
    await ch.purgeQueue(rabbit.names.dueQ);
    const approaching = await rem(id, "APPROACHING");
    expect(approaching.firedAt).toBeNull();
    await reminders.reconcile(RECON); // (3) OVERDUE langsung, (2) antre ulang, (1) publikasi outbox
    await until(async () => (await rem(id, "APPROACHING")).firedAt !== null);
    expect(await notes(id, "REMINDER_APPROACHING")).toBe(0);
    expect(await notes(id, "REMINDER_PASSED")).toBe(1);
    expect((await req(id)).status).toBe("OVERDUE");
  });
  it("tanpa publisher dan tanpa consumer: rekonsiliasi saja sudah memperbaiki permintaan yang lewat tenggat", async () => {
    const { id } = await sent({ sentAgoMs: H80 });
    await reminders.reconcile({ graceMs: 0 });
    expect((await req(id)).status).toBe("OVERDUE");
  });
  it("jeda grace: permintaan yang baru lewat tenggat belum disentuh (jalur broker diberi kesempatan dulu)", async () => {
    const { id } = await sent({ sentAgoMs: 73 * 3_600_000 }); // lewat 1 jam
    await reminders.reconcile({ graceMs: 2 * 3_600_000 });
    expect((await req(id)).status).toBe("SENT");
  });
});

describe("permintaan yang sudah dibalas/ditutup tidak memicu eskalasi", () => {
  it.each([
    {
      name: "dibalas",
      final: "RESPONDED",
      act: async (id: string, u: AuthUser) => void (await requests.addResponse(u, id, { category: "FULFILLED" })),
    },
    { name: "ditutup", final: "CLOSED", act: async (id: string, u: AuthUser) => void (await requests.finish(u, id, "CLOSED")) },
  ])("permintaan $name sebelum tenggat tetap $final setelah semua jalur memprosesnya", async ({ act, final }) => {
    const { id, user } = await sent({ scale: D3 });
    const d = await prisma.deadline.findUniqueOrThrow({ where: { requestId: id } });
    await reminders.publishOutbox();
    await act(id, user);
    await sleep(Math.max(0, d.dueAt!.getTime() - Date.now()) + 2500); // lewat tenggat; jalur broker sudah jalan
    expect((await req(id)).status).toBe(final);
    expect((await req(id)).overdueAt).toBeNull();
    expect(await marked(id)).toBe(0);
    expect(await notes(id, "REMINDER_PASSED")).toBe(0);
    await reminders.reconcile(RECON);
    await reminders.publishOutbox();
    await sleep(500);
    expect((await req(id)).status).toBe(final);
    expect(await marked(id)).toBe(0);
    await expect(reminders.applyOverdue(id)).resolves.toBe(false);
  });
  it("pesan PASSED yang sampai ke permintaan RESPONDED ditandai selesai tanpa efek (bukan hilang)", async () => {
    const { id, user } = await sent({ sentAgoMs: H80 }); // tenggat lewat, tetapi belum ada yang memproses
    await requests.addResponse(user, id, { category: "FULFILLED" });
    const passed = await rem(id, "PASSED");
    await rabbit.publishDelay({ reminderId: passed.id, kind: "PASSED", attempt: 0 }, 0);
    await until(async () => (await rem(id, "PASSED")).firedAt !== null);
    expect((await req(id)).status).toBe("RESPONDED");
    expect(await marked(id)).toBe(0);
    expect(await notes(id, "REMINDER_PASSED")).toBe(0);
  });
});

describe("aturan tanpa tenggat terverifikasi tidak pernah OVERDUE", () => {
  it("hak tanpa aturan VERIFIED: tidak ada dueAt, hanya FOLLOW_UP, rekonsiliasi tidak menyentuh", async () => {
    const nv = await prisma.legalRule.findFirstOrThrow({ where: { status: "NOT_VERIFIED" } });
    const { id } = await sent({ rightCode: nv.rightCode, sentAgoMs: H80 });
    expect((await prisma.deadline.findUniqueOrThrow({ where: { requestId: id } })).dueAt).toBeNull();
    expect((await prisma.reminder.findMany({ where: { requestId: id } })).map((x) => x.kind)).toEqual(["FOLLOW_UP"]);
    await reminders.reconcile({ graceMs: 0 });
    await expect(reminders.applyOverdue(id)).resolves.toBe(false);
    expect((await req(id)).status).toBe("SENT");
  });
  it("aturan NEEDS_CONFIRMATION (ada angka, belum terverifikasi) juga tidak pernah OVERDUE", async () => {
    const { id } = await sent({ sentAgoMs: H80 });
    const verified = await prisma.legalRule.findFirstOrThrow({ where: { rightCode: "ACCESS", status: "VERIFIED" } });
    const rule = await prisma.legalRule.create({
      data: {
        ruleKey: `uji-nc-${rid()}`,
        version: 1,
        rightCode: "ACCESS",
        legalBasis: "uji",
        durationHours: 72,
        status: "NEEDS_CONFIRMATION",
        effectiveFrom: new Date("2999-01-01"),
      }, // tak pernah terpilih aturan lain
    });
    try {
      await prisma.deadline.update({ where: { requestId: id }, data: { ruleId: rule.id } });
      await reminders.reconcile({ graceMs: 0 });
      await expect(reminders.applyOverdue(id)).resolves.toBe(false);
      expect((await req(id)).status).toBe("SENT");
    } finally {
      await prisma.deadline.update({ where: { requestId: id }, data: { ruleId: verified.id } });
      await prisma.legalRule.delete({ where: { id: rule.id } });
    }
  });
});

describe("retry + backoff, DLQ terpisah, ack/nack", () => {
  it("handler yang selalu gagal: 5 percobaan dengan backoff naik, lalu satu pesan di DLQ, queue lain kosong", async () => {
    const s = mk();
    const calls: number[] = [];
    await s.consume(async () => {
      calls.push(Date.now());
      throw new Error("boom");
    });
    await s.publishDelay(msg(), 0);
    await until(async () => (await depth(s.names.failed)) === 1);
    expect(calls).toHaveLength(5);
    [100, 200, 300, 400].forEach((ms, i) => expect(calls[i + 1] - calls[i]).toBeGreaterThanOrEqual(ms - 20)); // backoff
    const dead = (await ch.get(s.names.failed, { noAck: true })) as amqp.GetMessage;
    expect(JSON.parse(dead.content.toString())).toEqual({ reminderId: "x", kind: "PASSED", attempt: 4 }); // hanya ID, tanpa isi error/PII
    expect(await depth(s.names.dueQ)).toBe(0);
    for (const q of Object.values(s.names.retries)) expect(await depth(q)).toBe(0);
    await s.shutdown();
  });
  it("gagal dua kali lalu berhasil: diproses ulang dan di-ack, tidak ke DLQ", async () => {
    const s = mk();
    let n = 0;
    await s.consume(async () => {
      if (++n <= 2) throw new Error("sementara");
    });
    await s.publishDelay(msg(), 0);
    await until(async () => n === 3);
    await sleep(600);
    expect(n).toBe(3);
    expect(await depth(s.names.failed)).toBe(0);
    expect(await depth(s.names.dueQ)).toBe(0);
    await s.shutdown();
  });
  it("pesan rusak (bukan JSON / bentuk salah) langsung ke DLQ tanpa memanggil handler", async () => {
    const s = mk();
    let called = 0;
    await s.consume(async () => void called++);
    rawSend(s.names.due, "due", Buffer.from("bukan json {{{"));
    rawSend(s.names.due, "due", { foo: 1 });
    rawSend(s.names.due, "due", { reminderId: 7, kind: "PASSED", attempt: 0 });
    await until(async () => (await depth(s.names.failed)) === 3);
    expect(called).toBe(0);
    expect(await depth(s.names.dueQ)).toBe(0);
    await s.shutdown();
  });
});

describe("graceful shutdown", () => {
  it("menunggu pesan yang sedang diproses selesai dan di-ack, tidak ada redelivery, tidak menyambung ulang", async () => {
    const s = mk();
    let started = false;
    let done = false;
    await s.consume(async () => {
      started = true;
      await sleep(700);
      done = true;
    });
    await s.publishDelay(msg(), 0);
    await until(async () => started);
    await s.shutdown();
    expect(done).toBe(true); // handler tuntas sebelum koneksi ditutup
    expect(await depth(s.names.dueQ)).toBe(0); // ter-ack, bukan dikembalikan
    await expect(s.publishDelay(msg(), 0)).resolves.toBe(false); // sudah ditutup: tidak menyambung ulang
    const again = new RabbitService({ prefix: s.names.prefix, retry: s.names.retryLevels });
    extra.push(again);
    let calls = 0;
    await again.consume(async () => void calls++);
    await sleep(500);
    expect(calls).toBe(0);
    await again.shutdown();
  });
});

describe("pengingat yang dijadwal ulang tetap memberi tahu", () => {
  it("APPROACHING yang sudah terkirim lalu dijadwal ulang (waktu diterima dicatat) menghasilkan notifikasi baru, bukan diam", async () => {
    const { id, user } = await sent({ sentAgoMs: 60 * 3_600_000 }); // dueAt = +12 jam; APPROACHING (dueAt-24j) sudah jatuh tempo
    const a1 = await rem(id, "APPROACHING");
    await reminders.applyReminder(a1.id);
    expect(await notes(id, "REMINDER_APPROACHING")).toBe(1);
    await requests.setReceivedAt(user, id, new Date(Date.now() - 50 * 3_600_000)); // dueAt = +22 jam; APPROACHING = -2 jam
    const a2 = await rem(id, "APPROACHING");
    expect(a2.id).toBe(a1.id); // ID sama (upsert), firedAt di-reset
    expect(a2.firedAt).toBeNull();
    await reminders.applyReminder(a2.id);
    expect(await notes(id, "REMINDER_APPROACHING")).toBe(2);
  });
});

describe("DLQ pada skenario bersama", () => {
  it("tidak ada pesan di DLQ API selama seluruh skenario di atas (tidak ada pesan beracun tak sengaja)", async () => {
    expect(await depth(rabbit.names.failed)).toBe(0);
  });
});
