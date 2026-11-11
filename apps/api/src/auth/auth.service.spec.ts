// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
process.env.JWT_SECRET = "unit-test-secret-unit-test-secret-0123456789";
import * as bcrypt from "bcryptjs";
import { signToken } from "../common/auth";
import { hashPassword, verifyPassword } from "../common/password";
import { AuthService } from "./auth.module";

const PW = "SandiRahasia!2026";
type U = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  tokenVersion: number;
  deletedAt: null;
};

function setup(users: U[] = []) {
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => users.find((u) => u.email === where.email) ?? null),
      // meniru filter Prisma yang dipakai service: email|id, tokenVersion, emailVerifiedAt (null | not null)
      findFirst: jest.fn(
        async ({ where: w }: any) =>
          users.find(
            (u) =>
              (w.email ? u.email === w.email : u.id === w.id) &&
              (w.tokenVersion === undefined || u.tokenVersion === w.tokenVersion) &&
              (w.emailVerifiedAt === undefined || (w.emailVerifiedAt === null ? u.emailVerifiedAt === null : u.emailVerifiedAt !== null)),
          ) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const u = { id: "u1", emailVerifiedAt: null, tokenVersion: 0, deletedAt: null, ...data } as U;
        users.push(u);
        return u;
      }),
      update: jest.fn(async ({ where, data }: any) =>
        Object.assign(
          users.find((u) => u.id === where.id)!,
          data,
        ),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const u = users.find((x) => x.id === where.id && x.tokenVersion === where.tokenVersion && x.emailVerifiedAt === null);
        if (u) Object.assign(u, data);
        return { count: u ? 1 : 0 };
      }),
    },
  };
  const mailer = { send: jest.fn(async () => undefined) };
  return { svc: new AuthService(prisma as never, mailer as never), prisma, mailer, users };
}
const verified = async (email: string, hash?: string): Promise<U> => ({
  id: "u1",
  email,
  name: "A",
  passwordHash: hash ?? (await hashPassword(PW)),
  emailVerifiedAt: new Date(),
  tokenVersion: 0,
  deletedAt: null,
});

describe("password", () => {
  it("argon2id: hash unik per panggilan, verifikasi benar/salah", async () => {
    const h1 = await hashPassword(PW);
    expect(h1).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(h1).not.toContain(PW);
    expect(await hashPassword(PW)).not.toBe(h1);
    expect(await verifyPassword(PW, h1)).toEqual({ ok: true, needsRehash: false });
    expect((await verifyPassword("salah-salah-1", h1)).ok).toBe(false);
  });
  it("hash bcrypt lama tetap diverifikasi dan ditandai perlu rehash", async () => {
    expect(await verifyPassword(PW, await bcrypt.hash(PW, 4))).toEqual({ ok: true, needsRehash: true });
  });
});

describe("AuthService.register", () => {
  it("menyimpan hash argon2 (bukan sandi), email huruf kecil, dan mengirim tautan verifikasi", async () => {
    const { svc, prisma, mailer } = setup();
    const u = await svc.register("  Budi@Example.COM ", PW, "Budi");
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.email).toBe("budi@example.com");
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(data)).not.toContain(PW);
    expect(u.emailVerifiedAt).toBeNull();
    expect(mailer.send).toHaveBeenCalledTimes(1);
    const [to, , body] = mailer.send.mock.calls[0] as unknown as [string, string, string];
    expect(to).toBe("budi@example.com");
    expect(body).toMatch(/\/verifikasi\?token=ey/);
  });
  it("menolak sandi pendek dan email tidak valid", async () => {
    const { svc } = setup();
    await expect(svc.register("x@y.co", "pendek", "N")).rejects.toThrow(/minimal 10/);
    await expect(svc.register("bukan-email", PW, "N")).rejects.toThrow();
  });
  it("email ganda: respons sama dengan sukses (tidak membocorkan akun), tanpa akun baru, pemilik diberi tahu", async () => {
    const { svc, prisma, mailer } = setup([await verified("a@b.co")]);
    const r = await svc.register("A@b.co", PW, "Penyusup");
    expect(r).toMatchObject({ email: "a@b.co", emailVerifiedAt: null });
    expect(r.id).not.toBe("u1");
    expect(prisma.user.create).not.toHaveBeenCalled();
    const [to, subject, body] = mailer.send.mock.calls[0] as unknown as [string, string, string];
    expect(to).toBe("a@b.co");
    expect(subject).toMatch(/pendaftaran/i);
    expect(body).not.toMatch(/token=/); // tidak ada tautan verifikasi untuk akun yang sudah ada
  });
  it("gagal kirim email tidak menggagalkan pendaftaran", async () => {
    const { svc, mailer } = setup();
    mailer.send.mockRejectedValueOnce(new Error("smtp down"));
    await expect(svc.register("c@d.co", PW, "C")).resolves.toMatchObject({ email: "c@d.co" });
  });
});

describe("AuthService.verifyEmail", () => {
  it("token valid menandai terverifikasi; ulang tetap sukses (idempoten)", async () => {
    const { svc, users } = setup();
    const u = await svc.register("v@v.co", PW, "V");
    const t = signToken("verify", u.id, 0, 60);
    expect(await svc.verifyEmail(t)).toBe(true);
    expect(users[0].emailVerifiedAt).not.toBeNull();
    expect(await svc.verifyEmail(t)).toBe(true);
  });
  it("menolak token sampah, kedaluwarsa, jenis salah (access), dan tokenVersion lama", async () => {
    const { svc } = setup();
    const u = await svc.register("w@w.co", PW, "W");
    await expect(svc.verifyEmail("sampah")).rejects.toThrow(/tidak valid/);
    await expect(svc.verifyEmail(signToken("verify", u.id, 0, -10))).rejects.toThrow(/tidak valid/);
    await expect(svc.verifyEmail(signToken("access", u.id, 0, 60))).rejects.toThrow(/tidak valid/);
    await expect(svc.verifyEmail(signToken("verify", u.id, 5, 60))).rejects.toThrow(/tidak valid/);
  });
});

describe("AuthService.login", () => {
  it("sukses untuk akun terverifikasi", async () => {
    const { svc } = setup([await verified("ok@ok.co")]);
    await expect(svc.login("OK@ok.co", PW)).resolves.toMatchObject({ id: "u1" });
  });
  it("akun belum terverifikasi: sandi benar ditolak, sandi salah tetap 'salah' tanpa membocorkan status", async () => {
    const u = { ...(await verified("nv@nv.co")), emailVerifiedAt: null };
    const { svc } = setup([u]);
    await expect(svc.login("nv@nv.co", PW)).rejects.toThrow(/belum diverifikasi/);
    await expect(svc.login("nv@nv.co", "sandi-lain-123")).rejects.toThrow(/Email atau kata sandi salah/);
  });
  it("email tidak ada dan sandi salah memberi pesan sama", async () => {
    const { svc } = setup([await verified("ada@ada.co")]);
    const a = await svc.login("tidak@ada.co", PW).catch((e) => e.message);
    const b = await svc.login("ada@ada.co", "salah-salah-1").catch((e) => e.message);
    expect(a).toBe(b);
  });
  it("hash bcrypt lama diganti argon2 setelah login sukses", async () => {
    const { svc, users } = setup([await verified("old@old.co", await bcrypt.hash(PW, 4))]);
    await svc.login("old@old.co", PW);
    expect(users[0].passwordHash).toMatch(/^\$argon2id\$/);
    expect((await verifyPassword(PW, users[0].passwordHash)).ok).toBe(true);
  });
  it("terkunci setelah 5 kegagalan, bahkan dengan sandi benar", async () => {
    const { svc } = setup([await verified("lock@lock.co")]);
    for (let i = 0; i < 5; i++) await expect(svc.login("lock@lock.co", "salah-salah-1", "1.1.1.1")).rejects.toThrow(/salah/);
    await expect(svc.login("lock@lock.co", PW, "1.1.1.1")).rejects.toThrow(/Terlalu banyak/);
  });
  it("kunci per IP: penyerang dari IP lain tidak bisa mengunci pemilik akun", async () => {
    const { svc } = setup([await verified("victim@v.co")]);
    for (let i = 0; i < 6; i++) await svc.login("victim@v.co", "salah-salah-1", "6.6.6.6").catch(() => undefined);
    await expect(svc.login("victim@v.co", PW, "6.6.6.6")).rejects.toThrow(/Terlalu banyak/);
    await expect(svc.login("victim@v.co", PW, "2.2.2.2")).resolves.toMatchObject({ id: "u1" });
  });
});

describe("AuthService.refresh", () => {
  it("menerima refresh token; menolak access token, tokenVersion lama, dan kosong", async () => {
    const { svc, users } = setup([await verified("r@r.co")]);
    await expect(svc.refresh(signToken("refresh", "u1", 0, 60))).resolves.toMatchObject({ id: "u1" });
    await expect(svc.refresh(signToken("access", "u1", 0, 60))).rejects.toThrow(/Sesi berakhir/);
    await expect(svc.refresh(undefined)).rejects.toThrow(/Sesi berakhir/);
    users[0].tokenVersion = 1;
    await expect(svc.refresh(signToken("refresh", "u1", 0, 60))).rejects.toThrow(/Sesi berakhir/);
  });
});
