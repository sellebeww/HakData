// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import "./setup";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createApp } from "../src/main";
import { PrismaService } from "../src/prisma.service";

const PW = "RahasiaUji!2026-xyz";
const WRONG = "salah-salah-123";
const MAILPIT = `http://${process.env.MAIL_HOST ?? "localhost"}:8025`;
let app: INestApplication;
let prisma: PrismaService;
const logs: string[] = [];
const spies: jest.SpyInstance[] = [];
const rid = () => Math.random().toString(36).slice(2, 10);

type GqlBody = { data?: any; errors?: { message: string; extensions: { code: string } }[] };
const client = () => {
  let a: ReturnType<typeof request.agent>; // malas: client() dipanggil saat describe, sebelum app ada
  return {
    q: async (query: string, variables: object = {}) => {
      a ??= request.agent(app.getHttpServer());
      const r = await a.post("/graphql").send({ query, variables });
      return { body: r.body as GqlBody, cookies: (r.headers["set-cookie"] ?? []) as unknown as string[] };
    },
  };
};
const REG = `mutation($e:String!,$p:String!){register(email:$e,password:$p,name:"Uji"){id}}`;
const LOGIN = `mutation($e:String!,$p:String!){login(email:$e,password:$p){id email}}`;
const VERIFY = `mutation($t:String!){verifyEmail(token:$t)}`;

/** Ambil token verifikasi dari email yang benar-benar sampai di Mailpit. */
async function tokenFromMailpit(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json()) as {
      messages?: { ID: string }[];
    };
    if (list.messages?.length) {
      const m = (await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json()) as { Text: string };
      const t = m.Text.match(/token=([^\s&]+)/)?.[1];
      if (t) return decodeURIComponent(t);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Email verifikasi tidak sampai di Mailpit");
}

beforeAll(async () => {
  // tangkap semua keluaran proses (logger Nest menulis ke stdout/stderr) untuk uji kebocoran
  for (const stream of [process.stdout, process.stderr])
    spies.push(
      jest.spyOn(stream, "write").mockImplementation(((chunk: unknown) => {
        logs.push(String(chunk));
        return true;
      }) as never),
    );
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  spies.forEach((s) => s.mockRestore());
  await app.close();
});

describe("register → verifikasi email → login", () => {
  const email = `e2e-${rid()}@test.dev`;
  const c = client();
  let token: string;

  it("register: akun belum terverifikasi, tanpa sesi, sandi tersimpan sebagai argon2id", async () => {
    const r = await c.q(REG, { e: email, p: PW });
    expect(r.body.errors).toBeUndefined();
    expect(r.cookies).toHaveLength(0);
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.emailVerifiedAt).toBeNull();
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);
    expect(u.passwordHash).not.toContain(PW);
  });

  it("belum terverifikasi: login ditolak (FORBIDDEN) dan tanpa cookie", async () => {
    const r = await c.q(LOGIN, { e: email, p: PW });
    expect(r.body.errors![0].extensions.code).toBe("FORBIDDEN");
    expect(r.cookies).toHaveLength(0);
  });

  it("email sampai di Mailpit berisi tautan verifikasi", async () => {
    token = await tokenFromMailpit(email);
    expect(token.split(".")).toHaveLength(3);
  });

  it("token sampah ditolak; token asli memverifikasi dan idempoten", async () => {
    expect((await c.q(VERIFY, { t: "sampah" })).body.errors![0].extensions.code).toBe("BAD_USER_INPUT");
    expect((await c.q(VERIFY, { t: token })).body.data.verifyEmail).toBe(true);
    expect((await c.q(VERIFY, { t: token })).body.data.verifyEmail).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).not.toBeNull();
  });

  it("login sukses: cookie httpOnly + SameSite, tanpa token di body; me mengenali pengguna", async () => {
    const r = await c.q(LOGIN, { e: email, p: PW });
    expect(r.body.errors).toBeUndefined();
    expect(r.cookies).toHaveLength(2);
    for (const k of r.cookies) {
      expect(k).toMatch(/HttpOnly/i);
      expect(k).toMatch(/SameSite=Lax/i);
    }
    expect(JSON.stringify(r.body)).not.toMatch(/eyJ/);
    expect((await c.q(`{me{email}}`)).body.data.me.email).toBe(email);
  });

  it("sandi salah ditolak (UNAUTHENTICATED)", async () => {
    expect((await client().q(LOGIN, { e: email, p: WRONG })).body.errors![0].extensions.code).toBe("UNAUTHENTICATED");
  });

  it("refresh menerbitkan sesi baru; logout mencabut semua token, termasuk salinan cookie lama", async () => {
    expect((await c.q(`mutation{refresh{email}}`)).body.data.refresh.email).toBe(email);
    const copy = (await client().q(LOGIN, { e: email, p: PW })).cookies.map((k) => k.split(";")[0]).join("; ");
    const asCopy = () => request(app.getHttpServer()).post("/graphql").set("Cookie", copy);
    expect((await asCopy().send({ query: `{me{id}}` })).body.data.me).not.toBeNull();

    expect((await c.q(`mutation{logout}`)).body.data.logout).toBe(true);
    expect((await c.q(`{me{id}}`)).body.data.me).toBeNull();
    expect((await c.q(`mutation{refresh{id}}`)).body.errors![0].extensions.code).toBe("UNAUTHENTICATED");
    expect((await asCopy().send({ query: `{me{id}}` })).body.data.me).toBeNull();
    expect((await asCopy().send({ query: `mutation{refresh{id}}` })).body.errors![0].extensions.code).toBe("UNAUTHENTICATED");
  });

  it("guard menolak endpoint terproteksi tanpa sesi", async () => {
    expect((await client().q(`{myRequests{id}}`)).body.errors![0].extensions.code).toBe("UNAUTHENTICATED");
  });

  it("daftar ulang dengan email yang sudah ada: respons sama dengan sukses, tanpa akun kedua", async () => {
    const r = await client().q(REG, { e: email, p: PW });
    expect(r.body.errors).toBeUndefined();
    expect(r.body.data.register.id).toBeTruthy();
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
  it("kirim ulang verifikasi tidak membocorkan keberadaan email", async () => {
    const R = `mutation($e:String!){resendVerification(email:$e)}`;
    const a = await client().q(R, { e: email });
    const b = await client().q(R, { e: `tidak-ada-${rid()}@test.dev` });
    expect(a.body).toEqual(b.body);
  });
});

describe("rate limiting endpoint auth", () => {
  it("melewati batas → TOO_MANY_REQUESTS; batas dapat dikonfigurasi", async () => {
    // app terpisah: penghitung throttler per instance, jadi tidak tercemar tes lain
    const main = app;
    app = await createApp();
    await app.init();
    process.env.AUTH_RATE_LIMIT = "3";
    try {
      const c = client();
      const codes: string[] = [];
      for (let i = 0; i < 5; i++) codes.push((await c.q(VERIFY, { t: "sampah" })).body.errors![0].extensions.code);
      expect(codes).toEqual(["BAD_USER_INPUT", "BAD_USER_INPUT", "BAD_USER_INPUT", "TOO_MANY_REQUESTS", "TOO_MANY_REQUESTS"]);
      // Di belakang proxy Next (loopback/privat), kuota per IP asli dari X-Forwarded-For: pengguna lain tidak ikut terkunci.
      const viaProxy = (ip: string) =>
        request(app.getHttpServer())
          .post("/graphql")
          .set("X-Forwarded-For", ip)
          .send({ query: VERIFY, variables: { t: "sampah" } });
      expect((await viaProxy("203.0.113.7")).body.errors[0].extensions.code).toBe("BAD_USER_INPUT");
      for (let i = 0; i < 3; i++) await viaProxy("203.0.113.8");
      expect((await viaProxy("203.0.113.8")).body.errors[0].extensions.code).toBe("TOO_MANY_REQUESTS");
      expect((await viaProxy("203.0.113.9")).body.errors[0].extensions.code).toBe("BAD_USER_INPUT");
    } finally {
      process.env.AUTH_RATE_LIMIT = "100000";
      await app.close();
      app = main;
    }
  });
});

describe("header keamanan API (helmet)", () => {
  it("nosniff, tanpa X-Powered-By, HSTS, dan CORS hanya untuk WEB_ORIGIN", async () => {
    const r = await request(app.getHttpServer()).get("/health").set("Origin", "https://jahat.example");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-powered-by"]).toBeUndefined();
    expect(r.headers["strict-transport-security"]).toBeDefined();
    expect(r.headers["access-control-allow-origin"]).not.toBe("https://jahat.example");
  });
});

describe("tidak ada rahasia di log", () => {
  it("keluaran proses tidak memuat sandi, hash, JWT, secret, atau email pengguna uji", () => {
    const out = logs.join("");
    expect(out.length).toBeGreaterThan(0); // memastikan penangkapan log benar-benar jalan
    expect(out).not.toContain(PW);
    expect(out).not.toContain(WRONG);
    expect(out).not.toContain("$argon2");
    expect(out).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(out).not.toContain(process.env.JWT_SECRET!);
    expect(out).not.toMatch(/e2e-[a-z0-9]+@test\.dev/);
  });
});
