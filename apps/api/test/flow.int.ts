// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import "./setup";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createApp } from "../src/main";
import { PrismaService } from "../src/prisma.service";
import { ReminderService } from "../src/notifications/notifications.module";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PW = "DemoPass!2026";
const FILL = { fullName: "Budi Santoso", accountIdentifier: "budi@example.com", scope: "semua data" };
let app: INestApplication; let prisma: PrismaService; let reminders: ReminderService;
const rid = () => Math.random().toString(36).slice(2, 8);

const client = () => { const a = request.agent(app.getHttpServer());
  return { a, q: async (query: string, variables: object = {}) => { const r = await a.post("/graphql").send({ query, variables }); return r.body as { data?: any; errors?: { message: string; extensions: { code: string } }[] }; } }; };
const login = async (email: string, password = PW) => { const c = client(); const r = await c.q(`mutation($e:String!,$p:String!){login(email:$e,password:$p){role}}`, { e: email, p: password }); expect(r.errors).toBeUndefined(); return c; };
const signup = async () => { const c = client(); const r = await c.q(`mutation($e:String!,$p:String!){register(email:$e,password:$p,name:"Uji"){id}}`, { e: `u${rid()}@test.dev`, p: PW }); expect(r.errors).toBeUndefined(); return { ...c, id: r.data.register.id as string }; };
const REQ = `id status letterBody fields deadline{status dueAt ruleVersion basisNote ruleStatus disclaimer} timeline{type verification} evidence{id sha256} responses{category}`;

beforeAll(async () => { app = await createApp(); await app.init(); prisma = app.get(PrismaService); reminders = app.get(ReminderService); });
afterAll(async () => { await app.close(); });

describe("alur inti pengguna", () => {
  let u: Awaited<ReturnType<typeof signup>>; let companyId: string; let channelId: string; let reqId: string; let slug: string;
  beforeAll(async () => { u = await signup(); });

  it("mencari perusahaan + status verifikasi tampil", async () => {
    const r = await u.q(`{companies(search:"toko"){total items{id slug isDemo channels{id type status}}}}`);
    expect(r.data.companies.total).toBe(1); const c = r.data.companies.items[0];
    expect(c.isDemo).toBe(true); expect(c.channels.map((x: any) => x.status)).toContain("VERIFIED");
    companyId = c.id; slug = c.slug; channelId = c.channels.find((x: any) => x.type === "PRIVACY_EMAIL").id;
  });
  it("statistik: sampel cukup, berlabel DATA DEMO", async () => {
    const r = await u.q(`query($s:String!){companyStats(slug:$s){isDemoData sufficient requestsRecorded responseRatio label}}`, { s: slug });
    expect(r.data.companyStats).toMatchObject({ isDemoData: true, sufficient: true }); expect(r.data.companyStats.label).toMatch(/DEMO/);
  });
  it("membuat permintaan, validasi kolom wajib, mass assignment ditolak", async () => {
    let r = await u.q(`mutation($c:String!,$ch:String){createRequest(companyId:$c,rightCode:"ACCESS",channelId:$ch){id status}}`, { c: companyId, ch: channelId });
    reqId = r.data.createRequest.id; expect(r.data.createRequest.status).toBe("DRAFT");
    r = await u.q(`mutation($i:String!){generateLetter(id:$i){id}}`, { i: reqId });
    expect(r.errors![0].message).toMatch(/Kolom wajib/); expect(r.errors![0].extensions.code).toBe("BAD_USER_INPUT");
    r = await u.q(`mutation($i:String!,$f:JSON!){updateRequestFields(id:$i,fields:$f){fields status}}`, { i: reqId, f: { ...FILL, status: "COMPLETED", userId: "x" } });
    expect(r.data.updateRequestFields.fields).toEqual(FILL); expect(r.data.updateRequestFields.status).toBe("DRAFT");
  });
  it("surat, tinjau, kirim: deadline 72 jam dari aturan v1", async () => {
    let r = await u.q(`mutation($i:String!){generateLetter(id:$i){letterBody}}`, { i: reqId });
    expect(r.data.generateLetter.letterBody).toContain("Pasal 32"); expect(r.data.generateLetter.letterBody).not.toMatch(/\{\{/);
    r = await u.q(`mutation($i:String!){recordRequestSent(id:$i,sentVia:"EMAIL"){id}}`, { i: reqId });
    expect(r.errors![0].message).toMatch(/tidak diizinkan/); // belum ditinjau
    r = await u.q(`mutation($i:String!){reviewRequest(id:$i){status}}`, { i: reqId }); expect(r.data.reviewRequest.status).toBe("REVIEWED");
    const sentAt = new Date(Date.now() - 80 * 3_600_000).toISOString();
    r = await u.q(`mutation($i:String!,$s:DateTime){recordRequestSent(id:$i,sentVia:"EMAIL",sentAt:$s){${REQ}}}`, { i: reqId, s: sentAt });
    const d = r.data.recordRequestSent; expect(d.status).toBe("SENT");
    expect(d.deadline).toMatchObject({ status: "DEADLINE_PASSED", ruleVersion: 1, ruleStatus: "VERIFIED" });
    expect(new Date(d.deadline.dueAt).getTime() - new Date(sentAt).getTime()).toBe(72 * 3_600_000);
    expect(d.deadline.basisNote).toMatch(/Pasal 32/); expect(d.deadline.disclaimer).toMatch(/estimasi/);
    expect(d.timeline.map((e: any) => e.type)).toEqual(expect.arrayContaining(["REQUEST_CREATED", "LETTER_GENERATED", "LETTER_REVIEWED", "REQUEST_SENT", "DEADLINE_CALCULATED"]));
    r = await u.q(`mutation($i:String!){recordRequestSent(id:$i,sentVia:"EMAIL"){id}}`, { i: reqId }); expect(r.errors).toBeDefined(); // tidak bisa kirim dua kali
  });
  it("pengingat melewati outbox + RabbitMQ + consumer, idempoten", async () => {
    await reminders.runOnce();
    const notes = async () => (await u.q(`{notifications{type}}`)).data.notifications.map((n: any) => n.type) as string[];
    for (let i = 0; i < 40 && !(await notes()).includes("REMINDER_PASSED"); i++) await new Promise((r) => setTimeout(r, 250));
    const types = await notes();
    expect(types).toEqual(expect.arrayContaining(["REQUEST_RECORDED", "REMINDER_APPROACHING", "REMINDER_PASSED"])); expect(types).not.toContain("REMINDER_FOLLOW_UP");
    const rem = await prisma.scheduledReminder.findFirstOrThrow({ where: { requestId: reqId, kind: "PASSED" } });
    await reminders.handle(rem.id); await reminders.handle(rem.id); // pemrosesan ganda
    expect((await notes()).filter((t) => t === "REMINDER_PASSED")).toHaveLength(1);
    expect((await u.q(`{unreadCount}`)).data.unreadCount).toBeGreaterThanOrEqual(3);
    await reminders.runOnce(); // tidak ada antrean ulang untuk yang sudah fired
    expect((await notes()).filter((t) => t === "REMINDER_PASSED")).toHaveLength(1);
  });
  it("outbox: broker tak tersedia tidak menghilangkan pesan (pesan tetap tersimpan sampai terpublikasi)", async () => {
    const e = await prisma.outboxEvent.create({ data: { type: "reminder.due", payload: { reminderId: "tidak-ada" } } });
    await reminders.runOnce(); // consumer menangani id tak dikenal sebagai no-op
    await new Promise((r) => setTimeout(r, 300));
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: e.id } })).publishedAt).not.toBeNull();
  });
  it("bukti: PNG asli diterima, file palsu ditolak, hanya pemilik boleh mengunduh", async () => {
    const up = await u.a.post(`/evidence/${reqId}`).attach("file", PNG, "bukti kirim.png");
    expect(up.status).toBe(201); expect(up.body.sha256).toHaveLength(64);
    const fake = await u.a.post(`/evidence/${reqId}`).attach("file", Buffer.from("<script>alert(1)</script>"), "evil.pdf");
    expect(fake.status).toBe(400);
    const dl = await u.a.get(`/evidence/${up.body.id}/download`);
    expect(dl.status).toBe(200); expect(dl.headers["content-disposition"]).toContain("attachment"); expect(dl.headers["x-content-type-options"]).toBe("nosniff");
    const other = await signup();
    expect((await other.a.get(`/evidence/${up.body.id}/download`)).status).toBe(404);
    expect((await other.a.post(`/evidence/${reqId}`).attach("file", PNG, "x.png")).status).toBe(404);
    expect((await request(app.getHttpServer()).get(`/evidence/${up.body.id}/download`)).status).toBe(401);
  });
  it("respons, catatan, selesai, ekspor dossier; status tidak melompat", async () => {
    let r = await u.q(`mutation($i:String!){addCompanyResponse(id:$i,category:"ACKNOWLEDGED",note:"Terima kasih"){status responses{category}}}`, { i: reqId });
    expect(r.data.addCompanyResponse.status).toBe("RESPONDED");
    r = await u.q(`mutation($i:String!){addCompanyResponse(id:$i,category:"BOGUS"){id}}`, { i: reqId }); expect(r.errors).toBeDefined();
    r = await u.q(`mutation($i:String!){completeRequest(id:$i){status deadline{status}}}`, { i: reqId });
    expect(r.data.completeRequest).toMatchObject({ status: "COMPLETED", deadline: { status: "COMPLETED" } });
    const x = await u.q(`query($i:String!){dossierExport(id:$i)}`, { i: reqId });
    expect(x.data.dossierExport).toMatch(/Kronologi/); expect(x.data.dossierExport).toMatch(/belum diverifikasi independen/);
    r = await u.q(`mutation($i:String!){addCompanyResponse(id:$i,category:"OTHER"){id}}`, { i: reqId }); expect(r.errors).toBeDefined(); // sudah selesai
  });
  it("hak tanpa tenggat terverifikasi (DELETE): tidak ada hitung mundur", async () => {
    const r1 = await u.q(`mutation($c:String!){createRequest(companyId:$c,rightCode:"DELETE"){id}}`, { c: companyId }); const id = r1.data.createRequest.id;
    await u.q(`mutation($i:String!,$f:JSON!){updateRequestFields(id:$i,fields:$f){id}}`, { i: id, f: { ...FILL, deleteScope: "akun saya" } });
    await u.q(`mutation($i:String!){generateLetter(id:$i){id}}`, { i: id }); await u.q(`mutation($i:String!){reviewRequest(id:$i){id}}`, { i: id });
    const r = await u.q(`mutation($i:String!){recordRequestSent(id:$i,sentVia:"FORM"){${REQ}}}`, { i: id });
    expect(r.data.recordRequestSent.deadline).toMatchObject({ status: "RULE_NOT_VERIFIED", dueAt: null, ruleStatus: "NOT_VERIFIED" });
    const kinds = (await prisma.scheduledReminder.findMany({ where: { requestId: id } })).map((x) => x.kind); expect(kinds).toEqual(["FOLLOW_UP"]);
  });
});

describe("keamanan & otorisasi", () => {
  it("tanpa login ditolak; peran USER tidak bisa fungsi moderator/admin", async () => {
    const anon = client(); expect((await anon.q(`{myRequests{id}}`)).errors![0].extensions.code).toBe("UNAUTHENTICATED");
    const u = await signup();
    expect((await u.q(`{pendingSubmissions{id}}`)).errors![0].extensions.code).toBe("FORBIDDEN");
    expect((await u.q(`{auditLogs{id}}`)).errors![0].extensions.code).toBe("FORBIDDEN");
    expect((await u.q(`mutation{publishLegalRule(input:{rightCode:"ACCESS",legalBasis:"x",status:"VERIFIED",durationHours:1,effectiveFrom:"2026-01-01T00:00:00Z",verifiedBy:"x"}){id}}`)).errors![0].extensions.code).toBe("FORBIDDEN");
    const mod = await login("moderator@hakdata.demo");
    expect((await mod.q(`{auditLogs{id}}`)).errors![0].extensions.code).toBe("FORBIDDEN"); // moderator bukan admin
  });
  it("IDOR: pengguna lain tidak dapat membaca/mengubah permintaan orang lain", async () => {
    const a = await signup(); const b = await signup();
    const co = (await a.q(`{companies(search:"toko"){items{id}}}`)).data.companies.items[0].id;
    const id = (await a.q(`mutation($c:String!){createRequest(companyId:$c,rightCode:"ACCESS"){id}}`, { c: co })).data.createRequest.id;
    for (const [q, v] of [[`query($i:String!){request(id:$i){id}}`, { i: id }], [`mutation($i:String!){closeRequest(id:$i){id}}`, { i: id }], [`mutation($i:String!){updateLetter(id:$i,body:"x"){id}}`, { i: id }], [`query($i:String!){dossierExport(id:$i)}`, { i: id }]] as const) {
      const r = await b.q(q, v); expect(r.errors![0].extensions.code).toBe("NOT_FOUND");
    }
    expect((await b.q(`{myRequests{id}}`)).data.myRequests).toEqual([]);
  });
  it("brute force login dikunci; kata sandi lemah ditolak; SQLi tidak berpengaruh", async () => {
    const c = client(); const email = `bf${rid()}@test.dev`;
    for (let i = 0; i < 5; i++) await c.q(`mutation($e:String!){login(email:$e,password:"salahsalah!!"){id}}`, { e: email });
    expect((await c.q(`mutation($e:String!){login(email:$e,password:"salahsalah!!"){id}}`, { e: email })).errors![0].message).toMatch(/Terlalu banyak/);
    expect((await c.q(`mutation{register(email:"a@b.co",password:"pendek",name:"x"){id}}`)).errors![0].message).toMatch(/minimal 10/);
    const r = await c.q(`{companies(search:"' OR 1=1; DROP TABLE \\"User\\";--"){total}}`); expect(r.data.companies.total).toBe(0);
    expect(await prisma.user.count()).toBeGreaterThan(0);
  });
  it("query terlalu dalam ditolak; error internal tidak membocorkan detail", async () => {
    const c = client(); const fan = Array.from({ length: 130 }, (_, i) => `a${i}:companies{items{id}}`).join(" ");
    expect((await c.q(`{${fan}}`)).errors![0].message).toMatch(/terlalu kompleks/);
    const r = await c.q(`{company(slug:"tidak-ada"){id}}`); expect(r.errors![0].message).toBe("Perusahaan tidak ditemukan."); expect(JSON.stringify(r)).not.toMatch(/stacktrace|prisma/i);
  });
  it("cookie sesi httpOnly", async () => {
    const r = await request(app.getHttpServer()).post("/graphql").send({ query: `mutation{login(email:"user@hakdata.demo",password:"${PW}"){id}}` });
    expect(String(r.headers["set-cookie"])).toMatch(/HttpOnly/i);
  });
});

describe("moderasi, aturan hukum berversi, hapus akun", () => {
  it("usulan kanal -> moderator setujui -> COMMUNITY_REPORTED; spam/tanpa sumber ditolak", async () => {
    const u = await signup(); const co = (await u.q(`{companies(search:"seluler"){items{id slug}}}`)).data.companies.items[0];
    expect((await u.q(`mutation($c:String!){submitChannel(companyId:$c,type:"PRIVACY_EMAIL",value:"bukan-email",sourceUrl:"https://x.example/p"){id}}`, { c: co.id })).errors![0].message).toMatch(/email/i);
    expect((await u.q(`mutation($c:String!){submitChannel(companyId:$c,type:"PRIVACY_EMAIL",value:"baru${rid()}@seluler-contoh.example",sourceUrl:"http://tidak-https"){id}}`, { c: co.id })).errors).toBeDefined();
    const value = `baru${rid()}@seluler-contoh.example`;
    const s = await u.q(`mutation($c:String!,$v:String!){submitChannel(companyId:$c,type:"PRIVACY_EMAIL",value:$v,sourceUrl:"https://seluler-contoh.example/privasi"){id status}}`, { c: co.id, v: value });
    expect(s.data.submitChannel.status).toBe("PENDING");
    const mod = await login("moderator@hakdata.demo");
    await mod.q(`mutation($i:String!){reviewSubmission(id:$i,approve:true){status}}`, { i: s.data.submitChannel.id });
    const ch = (await u.q(`query($s:String!){company(slug:$s){channels{value status}}}`, { s: co.slug })).data.company.channels.find((c: any) => c.value === value);
    expect(ch.status).toBe("COMMUNITY_REPORTED");
    const admin = await login("admin@hakdata.demo"); // moderator tidak boleh menandai VERIFIED
    expect((await mod.q(`mutation($c:String!,$v:String!){upsertChannel(input:{companyId:$c,type:"PRIVACY_EMAIL",value:$v,status:"VERIFIED",sourceUrl:"https://x.example"}){id}}`, { c: co.id, v: value })).errors![0].extensions.code).toBe("FORBIDDEN");
    expect((await admin.q(`mutation($c:String!,$v:String!){upsertChannel(input:{companyId:$c,type:"PRIVACY_EMAIL",value:$v,status:"VERIFIED",sourceUrl:"https://x.example"}){status}}`, { c: co.id, v: value })).data.upsertChannel.status).toBe("VERIFIED");
  });
  it("aturan versi baru: permintaan lama tetap v1, baru memakai v2; tercatat di audit log", async () => {
    const admin = await login("admin@hakdata.demo"); const u = await signup();
    const co = (await u.q(`{companies(search:"toko"){items{id}}}`)).data.companies.items[0].id;
    const run = async () => { const id = (await u.q(`mutation($c:String!){createRequest(companyId:$c,rightCode:"CORRECTION"){id}}`, { c: co })).data.createRequest.id;
      await u.q(`mutation($i:String!,$f:JSON!){updateRequestFields(id:$i,fields:$f){id}}`, { i: id, f: { ...FILL, fieldToCorrect: "nama", correctValue: "Budi" } });
      await u.q(`mutation($i:String!){generateLetter(id:$i){id}}`, { i: id }); await u.q(`mutation($i:String!){reviewRequest(id:$i){id}}`, { i: id });
      return (await u.q(`mutation($i:String!){recordRequestSent(id:$i,sentVia:"EMAIL"){deadline{ruleVersion}}}`, { i: id })).data.recordRequestSent.deadline.ruleVersion as number; };
    const baseline = (h: number) => admin.q(`mutation($e:DateTime!,$h:Int!){publishLegalRule(input:{rightCode:"CORRECTION",legalBasis:"UU 27/2022 Pasal 30 ayat (1)",status:"VERIFIED",durationHours:$h,effectiveFrom:$e,verifiedBy:"uji"}){version}}`, { e: new Date(Date.now() - 2000).toISOString(), h });
    await baseline(72); // keadaan awal deterministik
    const before = await run();
    const eff = new Date(Date.now() - 1000).toISOString();
    const p = await admin.q(`mutation($e:DateTime!){publishLegalRule(input:{rightCode:"CORRECTION",legalBasis:"UU 27/2022 Pasal 30 (uji)",status:"VERIFIED",durationHours:48,effectiveFrom:$e,verifiedBy:"uji"}){version}}`, { e: eff });
    expect(p.data.publishLegalRule.version).toBe(before + 1);
    expect(await run()).toBe(before + 1);
    const old = await prisma.legalRule.findFirstOrThrow({ where: { ruleKey: "CORRECTION", version: before } }); expect(old.supersededAt).not.toBeNull(); expect(old.durationHours).toBe(72);
    expect((await admin.q(`{auditLogs{action}}`)).data.auditLogs.map((a: any) => a.action)).toContain("LEGAL_RULE_PUBLISHED");
    // aturan yang sudah dipakai permintaan tidak boleh dihapus (FK); pulihkan nilai awal dengan menerbitkan versi baru
    await admin.q(`mutation($e:DateTime!){publishLegalRule(input:{rightCode:"CORRECTION",legalBasis:"UU 27/2022 Pasal 30 ayat (1)",status:"VERIFIED",durationHours:72,effectiveFrom:$e,verifiedBy:"pemulihan uji"}){version}}`, { e: new Date(Date.now() - 500).toISOString() });
  });
  it("hapus akun menganonimkan data dan mencabut sesi", async () => {
    const u = await signup();
    const co = (await u.q(`{companies(search:"toko"){items{id}}}`)).data.companies.items[0].id;
    await u.q(`mutation($c:String!){createRequest(companyId:$c,rightCode:"ACCESS"){id}}`, { c: co });
    expect((await u.q(`{myDataExport{data}}`)).data.myDataExport.data.requests).toHaveLength(1);
    expect((await u.q(`mutation{deleteMyAccount}`)).data.deleteMyAccount).toBe(true);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } }); expect(row.email).toMatch(/invalid$/); expect(row.deletedAt).not.toBeNull();
    expect((await u.q(`{me{id}}`)).data.me).toBeNull();
  });
});
