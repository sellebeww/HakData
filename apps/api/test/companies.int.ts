// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import "./setup";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createApp } from "../src/main";
import { PrismaService } from "../src/prisma.service";

const PW = "DemoPass!2026";
let app: INestApplication;
let prisma: PrismaService;
let queries: string[] = [];
const rid = () => Math.random().toString(36).slice(2, 8);
type Body = { data?: any; errors?: { message: string; extensions: { code: string } }[] };
const client = () => {
  const a = request.agent(app.getHttpServer());
  return { q: async (query: string, variables: object = {}) => (await a.post("/graphql").send({ query, variables })).body as Body };
};
const login = async (email: string) => {
  const c = client();
  expect((await c.q(`mutation($e:String!,$p:String!){login(email:$e,password:$p){id}}`, { e: email, p: PW })).errors).toBeUndefined();
  return c;
};

beforeAll(async () => {
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
  (prisma as any).$on("query", (e: { query: string }) => queries.push(e.query));
});
afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: "uji-pg-" } } });
  await app.close();
});

describe("otorisasi verifikasi: hanya ADMIN", () => {
  let companyId: string;
  const UPSERT = `mutation($c:String!,$v:String!,$s:String!){upsertChannel(input:{companyId:$c,type:"DPO_EMAIL",value:$v,status:$s,sourceUrl:"https://x.example/p"}){id status}}`;
  beforeAll(async () => {
    companyId = (await prisma.company.findFirstOrThrow()).id;
  });
  it("anonim, USER, dan MODERATOR ditolak; ADMIN boleh OFFICIAL; UNVERIFIED tetap perlu ADMIN", async () => {
    const v = `dpo${rid()}@x.example`;
    const user = client();
    expect((await user.q(UPSERT, { c: companyId, v, s: "OFFICIAL" })).errors![0].extensions.code).toBe("UNAUTHENTICATED");
    for (const email of ["user@hakdata.demo", "moderator@hakdata.demo"]) {
      const c = await login(email);
      for (const s of ["OFFICIAL", "COMMUNITY_VERIFIED", "UNVERIFIED"])
        expect((await c.q(UPSERT, { c: companyId, v, s })).errors![0].extensions.code).toBe("FORBIDDEN");
      expect((await c.q(`mutation{deleteChannel(id:"x")}`)).errors![0].extensions.code).toBe("FORBIDDEN");
      expect((await c.q(`{pendingSubmissions{id}}`)).errors![0].extensions.code).toBe("FORBIDDEN");
      expect((await c.q(`mutation{reviewSubmission(id:"x",approve:true){id}}`)).errors![0].extensions.code).toBe("FORBIDDEN");
    }
    const admin = await login("admin@hakdata.demo");
    const r = await admin.q(UPSERT, { c: companyId, v, s: "OFFICIAL" });
    expect(r.data.upsertChannel.status).toBe("OFFICIAL");
    expect((await admin.q(UPSERT, { c: companyId, v, s: "VERIFIED" })).errors![0].extensions.code).toBe("BAD_USER_INPUT");
    expect((await admin.q(`mutation($i:String!){deleteChannel(id:$i)}`, { i: r.data.upsertChannel.id })).data.deleteChannel).toBe(true);
  });
});

describe("pencarian, cursor pagination, tanpa N+1", () => {
  const prefix = `uji-pg-${rid()}`;
  beforeAll(async () => {
    for (let i = 0; i < 25; i++)
      await prisma.company.create({
        data: {
          slug: `${prefix}-${i}`,
          name: `Zzuji ${prefix} ${String(i).padStart(2, "0")}`,
          industry: "Uji",
          channels: {
            create: [
              { type: "PRIVACY_EMAIL", value: `p${i}@uji.example` },
              { type: "DPO_EMAIL", value: `d${i}@uji.example` },
            ],
          },
        },
      });
  });
  const Q = `query($s:String,$f:Int,$a:String){companiesConnection(search:$s,first:$f,after:$a){edges{cursor node{slug channels{type value status}}} pageInfo{endCursor hasNextPage}}}`;
  it("halaman tidak tumpang tindih, lengkap, dan first dibatasi 50", async () => {
    const c = client();
    const seen: string[] = [];
    let after: string | null = null;
    for (let i = 0; i < 4; i++) {
      const r: Body = await c.q(Q, { s: prefix, f: 10, a: after });
      const cn = r.data.companiesConnection;
      seen.push(...cn.edges.map((e: any) => e.node.slug));
      after = cn.pageInfo.endCursor;
      expect(cn.pageInfo.hasNextPage).toBe(i < 2);
      if (!cn.pageInfo.hasNextPage) break;
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect((await c.q(Q, { s: prefix, f: 500 })).data.companiesConnection.edges).toHaveLength(25);
    expect((await c.q(Q, { s: prefix, f: 10, a: "bukan-cursor" })).errors![0].extensions.code).toBe("BAD_USER_INPUT");
  });
  it("filter status", async () => {
    const r = await client().q(`{companiesConnection(status:"OFFICIAL",first:50){edges{node{channels{status}}}}}`);
    for (const e of r.data.companiesConnection.edges) expect(e.node.channels.some((x: any) => x.status === "OFFICIAL")).toBe(true);
  });
  it("50 perusahaan + kanalnya = 2 query Prisma (companies, channels), bukan 51", async () => {
    const c = client();
    queries = [];
    const r = await c.q(Q, { s: prefix, f: 25 });
    expect(r.data.companiesConnection.edges[0].node.channels).toHaveLength(2);
    const sel = queries.filter((q) => /^SELECT/i.test(q) && !/Role|User/i.test(q.split("FROM")[1] ?? ""));
    console.log("query Prisma:\n" + sel.join("\n"));
    expect(sel.filter((q) => q.includes('"PrivacyChannel"'))).toHaveLength(1);
    expect(sel.filter((q) => q.includes('FROM "public"."Company"'))).toHaveLength(1);
  });
});
