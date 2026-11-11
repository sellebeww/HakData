// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import "./setup";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createApp } from "../src/main";
import { PrismaService } from "../src/prisma.service";

const PW = "DemoPass!2026";
let app: INestApplication;
let prisma: PrismaService;
let companyId: string;
const rid = () => Math.random().toString(36).slice(2, 8);
type Body = { data?: any; errors?: { message: string; extensions: { code: string } }[] };
const client = () => {
  const a = request.agent(app.getHttpServer());
  return { a, q: async (query: string, variables: object = {}) => (await a.post("/graphql").send({ query, variables })).body as Body };
};
const signup = async () => {
  const c = client();
  const email = `u${rid()}@test.dev`;
  const r = await c.q(`mutation($e:String!,$p:String!){register(email:$e,password:$p,name:"Uji"){id}}`, { e: email, p: PW });
  await prisma.user.update({ where: { id: r.data.register.id }, data: { emailVerifiedAt: new Date() } });
  expect((await c.q(`mutation($e:String!,$p:String!){login(email:$e,password:$p){id}}`, { e: email, p: PW })).errors).toBeUndefined();
  return { ...c, id: r.data.register.id as string };
};
type U = Awaited<ReturnType<typeof signup>>;
const code = (r: Body) => r.errors?.[0]?.extensions.code;

// setiap operasi pada satu permintaan, dengan variabel $i = id
const OPS: Record<string, string> = {
  updateRequestFields: `mutation($i:String!){updateRequestFields(id:$i,fields:{fullName:"X"}){id}}`,
  generateLetter: `mutation($i:String!){generateLetter(id:$i){id}}`,
  updateLetter: `mutation($i:String!){updateLetter(id:$i,body:"isi baru"){id}}`,
  reviewRequest: `mutation($i:String!){reviewRequest(id:$i){id}}`,
  recordRequestSent: `mutation($i:String!){recordRequestSent(id:$i,sentVia:"EMAIL"){id}}`,
  recordReceipt: `mutation($i:String!){recordReceipt(id:$i,receivedAt:"2026-11-11T10:00:00Z"){id}}`,
  addCompanyResponse: `mutation($i:String!){addCompanyResponse(id:$i,category:"ACKNOWLEDGED"){id}}`,
  addTimelineNote: `mutation($i:String!){addTimelineNote(id:$i,text:"catatan"){id}}`,
  completeRequest: `mutation($i:String!){completeRequest(id:$i){id}}`,
  closeRequest: `mutation($i:String!){closeRequest(id:$i){id}}`,
  sendRequestEmail: `mutation($i:String!){sendRequestEmail(id:$i){id}}`,
  escalateRequest: `mutation($i:String!){escalateRequest(id:$i){id}}`,
  dossier: `query($i:String!){dossier(requestId:$i){request{id}}}`,
  request: `query($i:String!){request(id:$i){id}}`,
  followUpLetter: `query($i:String!){followUpLetter(id:$i)}`,
  dossierExport: `query($i:String!){dossierExport(id:$i)}`,
};
const STATE = `query($i:String!){request(id:$i){status letterBody letterDisclaimer timeline{type actor metadata}}}`;
const FILL = `mutation($i:String!){updateRequestFields(id:$i,fields:{fullName:"Budi Santoso",accountIdentifier:"budi@example.com",scope:"semua data"}){id}}`;
const create = async (u: U) =>
  (await u.q(`mutation($c:String!){createRequest(companyId:$c,rightCode:"ACCESS"){id status}}`, { c: companyId })).data.createRequest;
const state = async (u: U, i: string) => (await u.q(STATE, { i })).data.request;
const toSent = async (u: U, i: string) => {
  for (const op of [FILL, OPS.generateLetter, OPS.reviewRequest, OPS.recordRequestSent])
    expect((await u.q(op, { i })).errors).toBeUndefined();
};

beforeAll(async () => {
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
  companyId = (await prisma.company.findFirstOrThrow({ where: { isDemo: true } })).id;
});
afterAll(async () => app.close());

describe("alur sah + RequestEvent", () => {
  it("createRequest = DRAFT; pratinjau memuat rujukan terverifikasi + disclaimer; tiap langkah tercatat (siapa, kapan, apa)", async () => {
    const u = await signup();
    const r = await create(u);
    expect(r.status).toBe("DRAFT");
    await toSent(u, r.id);
    const s = await state(u, r.id);
    expect(s.status).toBe("SENT");
    expect(s.letterBody).toMatch(/Pasal 32 UU No\. 27 Tahun 2022/);
    expect(s.letterBody).not.toMatch(/Pasal (6|7|8|9|10|11|42)\b/);
    expect(s.letterDisclaimer).toMatch(/bukan nasihat hukum/);
    expect(s.timeline.map((e: any) => e.type)).toEqual(
      expect.arrayContaining(["REQUEST_CREATED", "FIELDS_UPDATED", "LETTER_GENERATED", "LETTER_REVIEWED", "REQUEST_SENT"]),
    );
    expect(s.timeline.find((e: any) => e.type === "LETTER_REVIEWED").metadata).toMatchObject({ from: "DRAFT", to: "REVIEWED" });
    expect(s.timeline.find((e: any) => e.type === "REQUEST_SENT").metadata).toMatchObject({ from: "REVIEWED", to: "SENT" });
    const rows = await prisma.timelineEvent.findMany({ where: { requestId: r.id } });
    expect(rows.every((e) => e.occurredAt instanceof Date)).toBe(true);
    for (const e of rows) expect(e.actorId).toBe(e.actor === "USER" ? u.id : null);
    expect(rows.find((e) => e.type === "LETTER_GENERATED")!.actor).toBe("SYSTEM");
  });
  it("menyunting surat setelah ditinjau mengembalikan ke DRAFT dan tercatat", async () => {
    const u = await signup();
    const r = await create(u);
    for (const op of [FILL, OPS.generateLetter, OPS.reviewRequest, OPS.updateLetter]) await u.q(op, { i: r.id });
    const s = await state(u, r.id);
    expect(s.status).toBe("DRAFT");
    expect(s.timeline.find((e: any) => e.type === "LETTER_EDITED").metadata).toMatchObject({ from: "REVIEWED", to: "DRAFT" });
  });
});

describe("transisi ilegal ditolak lewat API dan tidak mengubah apa pun", () => {
  const expectRejected = async (u: U, i: string, ops: string[]) => {
    const before = await state(u, i);
    for (const op of ops) {
      const r = await u.q(OPS[op], { i });
      expect([op, code(r)]).toEqual([op, "BAD_USER_INPUT"]);
    }
    const after = await state(u, i);
    expect(after.status).toBe(before.status);
    expect(after.timeline).toHaveLength(before.timeline.length);
  };
  it("DRAFT: tidak bisa tinjau tanpa surat, kirim, respons, selesai", async () => {
    const u = await signup();
    const r = await create(u);
    await expectRejected(u, r.id, ["reviewRequest", "recordRequestSent", "recordReceipt", "addCompanyResponse", "completeRequest"]);
  });
  it("SENT: surat dan isian terkunci, tidak bisa tinjau/kirim ulang", async () => {
    const u = await signup();
    const r = await create(u);
    await toSent(u, r.id);
    await expectRejected(u, r.id, ["updateRequestFields", "generateLetter", "updateLetter", "reviewRequest", "recordRequestSent"]);
  });
  it("COMPLETED dan CLOSED: tidak ada mutasi yang lolos", async () => {
    const u = await signup();
    const r = await create(u);
    await toSent(u, r.id);
    expect((await u.q(OPS.completeRequest, { i: r.id })).errors).toBeUndefined();
    await expectRejected(u, r.id, [
      "updateRequestFields",
      "generateLetter",
      "updateLetter",
      "reviewRequest",
      "recordRequestSent",
      "completeRequest",
      "addCompanyResponse",
    ]);
    expect((await u.q(OPS.closeRequest, { i: r.id })).errors).toBeUndefined();
    await expectRejected(
      u,
      r.id,
      Object.keys(OPS).filter((k) => !["request", "followUpLetter", "dossierExport", "addTimelineNote", "dossier"].includes(k)),
    );
  });
});

describe("RequestEvent append-only di database", () => {
  it("UPDATE dan DELETE langsung ditolak; hapus berantai dari permintaan tetap jalan", async () => {
    const u = await signup();
    const r = await create(u);
    const ev = await prisma.timelineEvent.findFirstOrThrow({ where: { requestId: r.id } });
    await expect(prisma.timelineEvent.update({ where: { id: ev.id }, data: { description: "diubah" } })).rejects.toThrow(/append-only/);
    await expect(prisma.timelineEvent.delete({ where: { id: ev.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.timelineEvent.deleteMany({ where: { requestId: r.id } })).rejects.toThrow(/append-only/);
    expect(await prisma.timelineEvent.count({ where: { requestId: r.id } })).toBeGreaterThan(0);
    await prisma.privacyRequest.delete({ where: { id: r.id } }); // cascade
    expect(await prisma.timelineEvent.count({ where: { requestId: r.id } })).toBe(0);
  });
});

describe("IDOR: pengguna B tidak dapat menyentuh permintaan pengguna A", () => {
  it.each(["DRAFT", "SENT"])(
    "setiap operasi mengembalikan NOT_FOUND saat permintaan A berstatus %s, dan A tidak berubah",
    async (stage) => {
      const a = await signup();
      const b = await signup();
      const r = await create(a);
      if (stage === "SENT") await toSent(a, r.id);
      const before = await state(a, r.id);
      for (const [op, q] of Object.entries(OPS)) {
        const res = await b.q(q, { i: r.id });
        expect([op, code(res)]).toEqual([op, "NOT_FOUND"]);
      }
      expect(await state(a, r.id)).toEqual(before);
      expect((await b.q(`{myRequests{id}}`)).data.myRequests).toEqual([]);
    },
  );
  it("ID yang tidak ada dan ID milik orang lain tidak dapat dibedakan", async () => {
    const a = await signup();
    const b = await signup();
    const r = await create(a);
    const mine = await b.q(OPS.request, { i: r.id });
    const none = await b.q(OPS.request, { i: "tidak-ada-" + rid() });
    expect(mine.errors![0]).toEqual(none.errors![0]);
  });
  it("tanpa login: UNAUTHENTICATED di semua operasi", async () => {
    const a = await signup();
    const r = await create(a);
    const anon = client();
    for (const [op, q] of Object.entries(OPS)) expect([op, code(await anon.q(q, { i: r.id }))]).toEqual([op, "UNAUTHENTICATED"]);
  });
  it("createRequest tidak bisa menyetel pemilik atau status lewat argumen asing", async () => {
    const a = await signup();
    const b = await signup();
    const res = await b.q(`mutation($c:String!,$u:String!){createRequest(companyId:$c,rightCode:"ACCESS",userId:$u,status:"SENT"){id}}`, {
      c: companyId,
      u: a.id,
    });
    expect(code(res)).toBe("GRAPHQL_VALIDATION_FAILED");
  });
});

describe("konkurensi: aksi paralel tidak saling menimpa (compare-and-set status)", () => {
  it("dua recordRequestSent paralel: tepat satu sukses, satu REQUEST_SENT, satu tenggat", async () => {
    const u = await signup();
    const r = await create(u);
    for (const op of [FILL, OPS.generateLetter, OPS.reviewRequest]) expect((await u.q(op, { i: r.id })).errors).toBeUndefined();
    const res = await Promise.all([u.q(OPS.recordRequestSent, { i: r.id }), u.q(OPS.recordRequestSent, { i: r.id })]);
    expect(res.filter((x) => !x.errors)).toHaveLength(1);
    expect(res.map(code).filter(Boolean)).toEqual(["BAD_USER_INPUT"]);
    expect(await prisma.timelineEvent.count({ where: { requestId: r.id, type: "REQUEST_SENT" } })).toBe(1);
    expect(await prisma.deadline.count({ where: { requestId: r.id } })).toBe(1);
  });
  it("tutup vs respons paralel: bila penutupan tercatat, status akhir CLOSED (tidak dibuka lagi oleh respons)", async () => {
    for (let k = 0; k < 5; k++) {
      const u = await signup();
      const r = await create(u);
      await toSent(u, r.id);
      await Promise.all([u.q(OPS.closeRequest, { i: r.id }), u.q(OPS.addCompanyResponse, { i: r.id })]);
      const s = await state(u, r.id);
      const types = s.timeline.map((e: { type: string }) => e.type);
      if (types.includes("REQUEST_CLOSED")) expect(s.status).toBe("CLOSED");
      else expect(s.status).toBe("RESPONDED");
    }
  });
});

describe("unduh bukti yang berkas fisiknya hilang", () => {
  it("404 terkendali dan API tetap hidup (sebelumnya: exception stream tak tertangani mematikan proses)", async () => {
    const u = await signup();
    const r = await create(u);
    const e = await prisma.evidence.create({
      data: {
        requestId: r.id,
        storageKey: `hilang-${rid()}`,
        originalName: "x.pdf",
        mime: "application/pdf",
        size: 1,
        sha256: "0".repeat(64),
      },
    });
    const res = await u.a.get(`/evidence/${e.id}/download`);
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/); // bukan header PDF palsu
    expect((await u.q(OPS.request, { i: r.id })).errors).toBeUndefined(); // proses masih melayani
  });
});

describe("statistik: hanya pengiriman terverifikasi, ambang = pengguna berbeda", () => {
  const STATS = `query($s:String!){companyStats(slug:$s){sufficient requestsRecorded responsesRecorded withEvidence responseRatio}}`;
  const co = () => prisma.company.create({ data: { slug: `st-${rid()}`, name: `ST ${rid()}`, industry: "uji" } });
  const user = () =>
    prisma.user.create({ data: { email: `st${rid()}@test.dev`, passwordHash: "x", name: "Uji", emailVerifiedAt: new Date() } });
  const sentReq = async (companyId: string, userId: string, o: { platform?: boolean; reply?: "FULFILLED" | "NO_RESPONSE" } = {}) => {
    const r = await prisma.privacyRequest.create({
      data: {
        userId,
        companyId,
        rightCode: "ACCESS",
        title: "st",
        fields: {},
        status: o.reply ? "RESPONDED" : "SENT",
        sentAt: new Date(Date.now() - 48 * 3_600_000),
        sentVia: "EMAIL",
        ...(o.platform !== false && {
          emailDeliveries: {
            create: {
              kind: "REQUEST",
              toAddress: "p@st.example",
              subject: "st",
              messageId: `<${rid()}@t>`,
              contentSha256: "0".repeat(64),
              sentAt: new Date(),
            },
          },
        }),
      },
    });
    if (o.reply) await prisma.companyResponse.create({ data: { requestId: r.id, category: o.reply, receivedAt: new Date() } });
  };
  it("satu akun dengan 12 permintaan tidak mencapai ambang; tidak ada angka mentah yang bocor", async () => {
    const c = await co();
    const u = await user();
    for (let i = 0; i < 12; i++) await sentReq(c.id, u.id, { reply: "FULFILLED" });
    const s = (await client().q(STATS, { s: c.slug })).data.companyStats;
    expect(s).toEqual({ sufficient: false, requestsRecorded: null, responsesRecorded: null, withEvidence: null, responseRatio: null });
  });
  it("10 pengguna berbeda: tampil; NO_RESPONSE bukan balasan; catatan manual tanpa bukti kirim platform diabaikan", async () => {
    const c = await co();
    for (let i = 0; i < 10; i++) await sentReq(c.id, (await user()).id, { reply: i < 5 ? "FULFILLED" : i < 8 ? "NO_RESPONSE" : undefined });
    await sentReq(c.id, (await user()).id, { platform: false, reply: "FULFILLED" }); // diketik pengguna: tidak terverifikasi
    const s = (await client().q(STATS, { s: c.slug })).data.companyStats;
    expect(s).toMatchObject({ sufficient: true, requestsRecorded: 10, responsesRecorded: 5, responseRatio: 0.5 });
  });
});
