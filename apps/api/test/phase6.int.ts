// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// Fase 6: email (Mailpit nyata), dossier GraphQL, perusahaan simulasi, eskalasi. Waktu dipercepat DEADLINE_TIME_SCALE (72 jam = 3 dtk).
import "./setup";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createApp } from "../src/main";
import { PrismaService } from "../src/prisma.service";
import { SimulationService } from "../src/simulation/simulation.module";
import { ReminderService } from "../src/notifications/notifications.module";

jest.setTimeout(60_000);
const PW = "DemoPass!2026";
const rid = () => Math.random().toString(36).slice(2, 8);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let app: INestApplication;
let prisma: PrismaService;
type Body = { data?: any; errors?: { message: string; extensions: { code: string } }[] };

const signup = async () => {
  const a = request.agent(app.getHttpServer());
  const q = async (query: string, variables: object = {}) => (await a.post("/graphql").send({ query, variables })).body as Body;
  const email = `p6${rid()}@test.dev`;
  const r = await q(`mutation($e:String!,$p:String!){register(email:$e,password:$p,name:"Uji"){id}}`, { e: email, p: PW });
  await prisma.user.update({ where: { id: r.data.register.id }, data: { emailVerifiedAt: new Date() } });
  await q(`mutation($e:String!,$p:String!){login(email:$e,password:$p){id}}`, { e: email, p: PW });
  return { q, email, id: r.data.register.id as string };
};
const company = (sim: "REPLIES" | "REPLIES_LATE" | "SILENT" | null) =>
  prisma.company.create({
    data: {
      slug: `p6-${rid()}`,
      name: `P6 ${rid()}`,
      industry: "uji",
      isDemo: true,
      simulation: sim,
      channels: { create: { type: "PRIVACY_EMAIL", value: `privacy-${rid()}@p6.example`, status: "OFFICIAL" } },
    },
    include: { channels: true },
  });
const FILL = `mutation($i:String!){updateRequestFields(id:$i,fields:{fullName:"Budi Santoso",accountIdentifier:"budi@example.com",scope:"semua data"}){id}}`;
/** Permintaan REVIEWED siap dikirim lewat email. */
async function reviewed(u: Awaited<ReturnType<typeof signup>>, companyId: string) {
  const r = (await u.q(`mutation($c:String!){createRequest(companyId:$c,rightCode:"ACCESS"){id}}`, { c: companyId })).data.createRequest;
  for (const op of [FILL, `mutation($i:String!){generateLetter(id:$i){id}}`, `mutation($i:String!){reviewRequest(id:$i){id}}`])
    expect((await u.q(op, { i: r.id })).errors).toBeUndefined();
  return r.id as string;
}
const SEND = `mutation($i:String!){sendRequestEmail(id:$i){id status}}`;
const DOSSIER = `query($i:String!){dossier(requestId:$i){
  deliveries{kind toAddress messageId contentSha256 sentAt}
  request{id status dueAt events{type actor evidence{id}} evidence{id sha256} responses{category simulated elapsedMs lateByMs}}}}`;
const mailpit = async (to: string) => {
  for (let i = 0; i < 40; i++) {
    const j = (await (
      await fetch(`http://${process.env.MAIL_HOST ?? "localhost"}:8025/api/v1/search?query=${encodeURIComponent("to:" + to)}`)
    ).json()) as {
      messages: { ID: string; Subject: string }[];
    };
    if (j.messages.length) return j.messages;
    await sleep(250);
  }
  return [];
};

let savedScale: string | undefined;
beforeAll(async () => {
  savedScale = process.env.DEADLINE_TIME_SCALE;
  process.env.DEADLINE_TIME_SCALE = "86400";
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  if (savedScale === undefined) delete process.env.DEADLINE_TIME_SCALE;
  else process.env.DEADLINE_TIME_SCALE = savedScale;
  await app.close();
});

describe("kirim email + bukti kirim", () => {
  it("surat tertangkap Mailpit; message-id, waktu, hash isi tercatat; status SENT; tenggat dihitung", async () => {
    const u = await signup();
    const co = await company(null);
    const id = await reviewed(u, co.id);
    const sent = await u.q(SEND, { i: id });
    expect(sent.errors).toBeUndefined();
    expect(sent.data.sendRequestEmail.status).toBe("SENT");
    const d = (await u.q(DOSSIER, { i: id })).data.dossier;
    expect(d.deliveries).toHaveLength(1);
    expect(d.deliveries[0]).toMatchObject({ kind: "REQUEST", toAddress: co.channels[0].value });
    expect(d.deliveries[0].contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(d.request.dueAt).toBeTruthy();
    expect(d.request.events.map((e: any) => e.type)).toEqual(
      expect.arrayContaining(["EMAIL_DELIVERED", "REQUEST_SENT", "DEADLINE_CALCULATED"]),
    );
    const msgs = await mailpit(co.channels[0].value);
    expect(msgs.length).toBe(1);
    const raw = await (await fetch(`http://localhost:8025/api/v1/message/${msgs[0].ID}/headers`)).json();
    expect(raw["Message-Id"]?.[0] ?? raw["Message-ID"]?.[0]).toBe(d.deliveries[0].messageId);
    expect((raw["Reply-To"] ?? [""])[0]).toContain(u.email);
  });
  it("kanal bukan email: ditolak dan status tidak berubah", async () => {
    const u = await signup();
    const co = await prisma.company.create({ data: { slug: `p6-${rid()}`, name: "P6 tanpa email", industry: "uji" } });
    const id = await reviewed(u, co.id);
    const r = await u.q(SEND, { i: id });
    expect(r.errors?.[0].extensions.code).toBe("BAD_USER_INPUT");
    expect((await prisma.privacyRequest.findUniqueOrThrow({ where: { id } })).status).toBe("REVIEWED");
    expect(await prisma.emailDelivery.count({ where: { requestId: id } })).toBe(0);
  });
});

describe("klik ganda kirim email", () => {
  it("dua sendRequestEmail paralel: tepat satu email ke perusahaan, satu bukti kirim, satu ditolak", async () => {
    const u = await signup();
    const co = await company(null);
    const id = await reviewed(u, co.id);
    const res = await Promise.all([u.q(SEND, { i: id }), u.q(SEND, { i: id })]);
    expect(res.filter((r) => !r.errors)).toHaveLength(1);
    expect(res.filter((r) => r.errors?.[0].extensions.code === "BAD_USER_INPUT")).toHaveLength(1);
    expect(await prisma.emailDelivery.count({ where: { requestId: id, kind: "REQUEST" } })).toBe(1);
    await sleep(500); // beri waktu email kedua (bila ada) sampai di Mailpit
    expect(await mailpit(co.channels[0].value)).toHaveLength(1);
  });
});

describe("perusahaan simulasi + dossier", () => {
  it("REPLIES: membalas tepat waktu; selisih dihitung, lateBy = 0", async () => {
    const u = await signup();
    const co = await company("REPLIES");
    const id = await reviewed(u, co.id);
    await u.q(SEND, { i: id });
    const sim = app.get(SimulationService);
    expect(await sim.tick()).toBe(0); // belum waktunya
    await sleep(1_500); // 40% dari 3 dtk = 1,2 dtk
    await sim.tick();
    expect(await sim.tick()).toBe(0); // idempoten
    const { request: r } = (await u.q(DOSSIER, { i: id })).data.dossier;
    expect(r.status).toBe("RESPONDED");
    expect(r.responses).toHaveLength(1);
    expect(r.responses[0]).toMatchObject({ simulated: true, lateByMs: 0 });
    expect(r.responses[0].elapsedMs).toBeGreaterThan(1_000);
    expect(r.responses[0].elapsedMs).toBeLessThan(1_500);
  });
  it("REPLIES_LATE: membalas setelah tenggat; keterlambatan dihitung otomatis", async () => {
    const u = await signup();
    const co = await company("REPLIES_LATE");
    const id = await reviewed(u, co.id);
    await u.q(SEND, { i: id });
    await sleep(4_200); // 130% dari 3 dtk = 3,9 dtk
    await app.get(SimulationService).tick();
    const { request: r } = (await u.q(DOSSIER, { i: id })).data.dossier;
    expect(r.status).toBe("RESPONDED");
    expect(r.responses[0].lateByMs).toBeGreaterThan(800);
    expect(r.responses[0].lateByMs).toBeLessThan(1_000);
  });
  it("SILENT: tidak membalas -> OVERDUE -> pengguna eskalasi; dossier memuat seluruh jalur", async () => {
    const u = await signup();
    const co = await company("SILENT");
    const id = await reviewed(u, co.id);
    await u.q(SEND, { i: id });
    await sleep(3_300);
    expect(await app.get(SimulationService).tick()).toBe(0);
    await app.get(ReminderService).reconcile({ graceMs: 0 });
    expect((await prisma.privacyRequest.findUniqueOrThrow({ where: { id } })).status).toBe("OVERDUE");
    expect(
      (await u.q(`mutation($i:String!){escalateRequest(id:$i,note:"siap lapor"){status}}`, { i: id })).data.escalateRequest.status,
    ).toBe("ESCALATED");
    expect((await u.q(`mutation($i:String!){escalateRequest(id:$i){id}}`, { i: id })).errors?.[0].extensions.code).toBe("BAD_USER_INPUT");
    const { request: r } = (await u.q(DOSSIER, { i: id })).data.dossier;
    expect(r.events.map((e: any) => e.type)).toEqual(expect.arrayContaining(["EMAIL_DELIVERED", "OVERDUE_MARKED", "REQUEST_ESCALATED"]));
    expect(r.responses).toHaveLength(0);
  });
  it("eskalasi hanya dari OVERDUE; balasan manual terlambat dihitung; bukti terhubung ke balasan dan peristiwa", async () => {
    const u = await signup();
    const co = await company(null);
    const id = await reviewed(u, co.id);
    await u.q(SEND, { i: id });
    expect((await u.q(`mutation($i:String!){escalateRequest(id:$i){id}}`, { i: id })).errors?.[0].extensions.code).toBe("BAD_USER_INPUT"); // masih SENT
    await sleep(3_300);
    await app.get(ReminderService).reconcile({ graceMs: 0 });
    const ev = await prisma.evidence.create({
      data: {
        requestId: id,
        storageKey: `p6-${rid()}`,
        originalName: "balasan.pdf",
        mime: "application/pdf",
        size: 10,
        sha256: "a".repeat(64),
      },
    });
    const add = await u.q(`mutation($i:String!,$e:String){addCompanyResponse(id:$i,category:"REJECTED",evidenceId:$e){status}}`, {
      i: id,
      e: ev.id,
    });
    expect(add.errors).toBeUndefined();
    const { request: r } = (
      await u.q(`query($i:String!){dossier(requestId:$i){request{responses{lateByMs evidence{id sha256}} events{type evidence{id}}}}}`, {
        i: id,
      })
    ).data.dossier;
    expect(r.responses[0].lateByMs).toBeGreaterThan(0);
    expect(r.responses[0].evidence).toEqual({ id: ev.id, sha256: "a".repeat(64) });
    expect(r.events.find((e: any) => e.type === "COMPANY_RESPONDED").evidence.id).toBe(ev.id);
  });
});

describe("email pengingat ke pengguna", () => {
  it("notifikasi pengingat diemail sekali (idempoten) dengan bukti kirim", async () => {
    const u = await signup();
    const co = await company(null);
    const id = await reviewed(u, co.id);
    await u.q(SEND, { i: id });
    await sleep(3_300);
    const rem = app.get(ReminderService);
    await rem.reconcile({ graceMs: 0 }); // OVERDUE + notifikasi REMINDER_PASSED
    expect(await rem.emailPending()).toBeGreaterThanOrEqual(1);
    expect(await rem.emailPending()).toBe(0);
    const rows = await prisma.emailDelivery.findMany({ where: { requestId: id, kind: "REMINDER" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].toAddress).toBe(u.email);
    expect((await mailpit(u.email)).some((m) => /tenggat/i.test(m.Subject))).toBe(true);
  });
});

describe("dossier: kepemilikan", () => {
  it("pengguna lain mendapat NOT_FOUND", async () => {
    const a = await signup();
    const b = await signup();
    const id = await reviewed(a, (await company(null)).id);
    expect((await b.q(DOSSIER, { i: id })).errors?.[0].extensions.code).toBe("NOT_FOUND");
  });
});
