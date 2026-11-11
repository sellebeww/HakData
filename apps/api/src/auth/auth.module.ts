// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { BadRequestException, ForbiddenException, Injectable, Logger, Module, UnauthorizedException } from "@nestjs/common";
import { Args, Context, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";
import { IsEmail, IsString, MaxLength, MinLength, validateOrReject } from "class-validator";
import { PrismaService } from "../prisma.service";
import {
  AuthUser,
  clearSessionCookies,
  COOKIE,
  CurrentUser,
  Public,
  readToken,
  REFRESH_COOKIE,
  setSessionCookies,
  signToken,
} from "../common/auth";
import { config } from "../common/config";
import { Mailer } from "../common/mailer"; // disediakan global oleh MailModule
import { DUMMY_HASH, hashPassword, verifyPassword } from "../common/password";
import { UserT } from "../gql/types";
import { removeFile } from "../common/files";
import { randomUUID } from "node:crypto";

class Creds {
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @MinLength(10, { message: "Kata sandi minimal 10 karakter" }) @MaxLength(200) password: string;
}

// Batas per IP per menit untuk endpoint auth; dibaca saat dipanggil agar bisa diubah di test.
const authLimit = () => Number(process.env.AUTH_RATE_LIMIT ?? 10);
const AUTH_THROTTLE = { default: { limit: authLimit, ttl: 60_000 } };
const VERIFY_TTL_S = 24 * 3600;

// Batas percobaan login per (IP, email): penyerang tidak bisa mengunci akun orang lain dari IP-nya sendiri.
// shortcut: in-memory, satu instance; untuk multi-instance pindahkan ke Redis/DB.
const fails = new Map<string, { n: number; until: number }>();
const MAX_FAILS = 5,
  LOCK_MS = 10 * 60_000,
  MAX_TRACKED = 10_000;
function recordFail(key: string, prev: { n: number; until: number } | undefined) {
  const now = Date.now();
  if (fails.size >= MAX_TRACKED) for (const [k, v] of fails) if (v.until <= now) fails.delete(k); // cegah memori tumbuh tanpa batas
  if (fails.size >= MAX_TRACKED) fails.delete(fails.keys().next().value!); // masih penuh: buang entri tertua
  fails.set(key, { n: (prev && prev.until > now ? prev.n : 0) + 1, until: now + LOCK_MS });
}

@Injectable()
export class AuthService {
  private log = new Logger("Auth");
  constructor(
    private prisma: PrismaService,
    private mailer: Mailer,
  ) {}

  private async sendVerification(u: { id: string; email: string; tokenVersion: number }) {
    const token = signToken("verify", u.id, u.tokenVersion, VERIFY_TTL_S);
    const link = `${config.webOrigin}/verifikasi?token=${encodeURIComponent(token)}`;
    await this.mailer
      .send(
        u.email,
        "Verifikasi email Hak Data",
        `Buka tautan ini untuk memverifikasi email Anda (berlaku 24 jam):\n\n${link}\n\nAbaikan email ini jika Anda tidak mendaftar.`,
      )
      .catch(() => this.log.warn(`Email verifikasi gagal dikirim (user ${u.id})`)); // pengguna dapat meminta kirim ulang
  }

  async register(email: string, password: string, name: string) {
    const c = Object.assign(new Creds(), { email: email.trim().toLowerCase(), password });
    await validateOrReject(c).catch((e) => {
      throw new BadRequestException(Object.values(e[0].constraints).join(", "));
    });
    if (!name.trim() || name.length > 100) throw new BadRequestException("Nama wajib diisi (maks. 100 karakter).");
    const passwordHash = await hashPassword(password); // selalu dihitung: waktu respons sama untuk email baru maupun lama
    const u = (await this.prisma.user.findUnique({ where: { email: c.email } }))
      ? null
      : await this.prisma.user.create({ data: { email: c.email, name: name.trim(), passwordHash } }).catch((e) => {
          if ((e as { code?: string }).code === "P2002") return null; // daftar paralel dengan email sama
          throw e;
        });
    if (u) {
      await this.sendVerification(u);
      return u;
    }
    // Email sudah terdaftar: respons sama dengan sukses agar keberadaan akun tidak bocor; pemilik asli diberi tahu lewat email.
    await this.mailer
      .send(
        c.email,
        "Percobaan pendaftaran Hak Data",
        "Ada yang mencoba mendaftar dengan email ini, padahal akun Anda sudah ada. Silakan masuk seperti biasa.\n\nAbaikan email ini bila itu bukan Anda.",
      )
      .catch(() => this.log.warn("Email pemberitahuan pendaftaran ganda gagal dikirim"));
    return { id: randomUUID(), email: c.email, name: name.trim(), role: "USER" as const, emailVerifiedAt: null };
  }

  async verifyEmail(token: string) {
    const t = readToken(token, "verify");
    if (!t) throw new BadRequestException("Tautan verifikasi tidak valid atau sudah kedaluwarsa.");
    // idempoten; tv ikut dicek agar tautan lama mati setelah sesi dicabut
    const r = await this.prisma.user.updateMany({
      where: { id: t.sub, deletedAt: null, tokenVersion: t.tv, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
    if (!r.count && !(await this.prisma.user.findFirst({ where: { id: t.sub, deletedAt: null, emailVerifiedAt: { not: null } } })))
      throw new BadRequestException("Tautan verifikasi tidak valid atau sudah kedaluwarsa.");
    return true;
  }

  /** Selalu sukses agar tidak membocorkan apakah email terdaftar. */
  async resendVerification(email: string) {
    const u = await this.prisma.user.findFirst({ where: { email: email.trim().toLowerCase(), deletedAt: null, emailVerifiedAt: null } });
    if (u) await this.sendVerification(u);
    return true;
  }

  async login(email: string, password: string, ip = "") {
    const addr = email.trim().toLowerCase();
    const key = `${ip}|${addr}`;
    const f = fails.get(key);
    if (f && f.n >= MAX_FAILS && f.until > Date.now())
      throw new UnauthorizedException("Terlalu banyak percobaan. Coba lagi beberapa menit lagi.");
    const u = await this.prisma.user.findFirst({ where: { email: addr, deletedAt: null } });
    const { ok, needsRehash } = await verifyPassword(password, u?.passwordHash ?? (await DUMMY_HASH));
    if (!u || !ok) {
      recordFail(key, f);
      throw new UnauthorizedException("Email atau kata sandi salah.");
    }
    fails.delete(key);
    if (!u.emailVerifiedAt) throw new ForbiddenException("Email belum diverifikasi. Cek kotak masuk Anda atau minta kirim ulang tautan.");
    if (needsRehash) await this.prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(password) } });
    return u;
  }

  async refresh(token: string | undefined) {
    const t = readToken(token, "refresh");
    const u =
      t &&
      (await this.prisma.user.findFirst({ where: { id: t.sub, deletedAt: null, emailVerifiedAt: { not: null }, tokenVersion: t.tv } }));
    if (!u) throw new UnauthorizedException("Sesi berakhir. Silakan masuk kembali.");
    return u;
  }

  /** Naikkan tokenVersion: semua token (access, refresh, tautan verifikasi) lama langsung tidak sah. */
  revokeAll(userId: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  }
}

@Resolver()
export class AuthResolver {
  constructor(
    private auth: AuthService,
    private prisma: PrismaService,
  ) {}
  @Public() @Throttle(AUTH_THROTTLE) @Mutation(() => UserT) register(
    @Args("email") e: string,
    @Args("password") p: string,
    @Args("name") n: string,
  ) {
    return this.auth.register(e, p, n); // tidak membuat sesi: login baru boleh setelah verifikasi email
  }
  @Public() @Throttle(AUTH_THROTTLE) @Mutation(() => Boolean) verifyEmail(@Args("token") token: string) {
    return this.auth.verifyEmail(token);
  }
  @Public() @Throttle(AUTH_THROTTLE) @Mutation(() => Boolean) resendVerification(@Args("email") email: string) {
    return this.auth.resendVerification(email);
  }
  @Public() @Throttle(AUTH_THROTTLE) @Mutation(() => UserT) async login(
    @Args("email") e: string,
    @Args("password") p: string,
    @Context() ctx: any,
  ) {
    const u = await this.auth.login(e, p, ctx.req.ip);
    setSessionCookies(ctx.res, u.id, u.tokenVersion);
    return u;
  }
  // web memanggil refresh pada tiap muat halaman bila access token tidak ada, jadi batasnya lebih longgar
  @Public() @Throttle({ default: { limit: () => authLimit() * 3, ttl: 60_000 } }) @Mutation(() => UserT) async refresh(
    @Context() ctx: any,
  ) {
    const u = await this.auth.refresh(ctx.req.cookies?.[REFRESH_COOKIE]);
    setSessionCookies(ctx.res, u.id, u.tokenVersion);
    return u;
  }
  @Public() @Mutation(() => Boolean) async logout(@Context() ctx: any) {
    // identitas dari refresh token juga, supaya logout tetap mencabut sesi saat access token sudah kedaluwarsa
    const t = readToken(ctx.req.cookies?.[REFRESH_COOKIE], "refresh") ?? readToken(ctx.req.cookies?.[COOKIE], "access");
    if (t) await this.prisma.user.updateMany({ where: { id: t.sub, tokenVersion: t.tv }, data: { tokenVersion: { increment: 1 } } });
    clearSessionCookies(ctx.res);
    return true;
  }
  @Public() @Query(() => UserT, { nullable: true }) me(@CurrentUser() u: AuthUser | null) {
    return u;
  }

  /**
   * Hapus akun. Permintaan dihapus PERMANEN (berantai: linimasa, bukti, balasan, tenggat, pengingat, bukti kirim), karena linimasa
   * append-only memuat teks bebas pengguna yang tidak bisa dianonimkan di tempat. Statistik tidak terpengaruh: sejak awal hanya menghitung
   * permintaan aktif. Baris User dipertahankan dalam bentuk anonim agar referensi audit log tetap utuh.
   */
  @Mutation(() => Boolean) async deleteMyAccount(@CurrentUser() u: AuthUser, @Context() ctx: any) {
    const files = await this.prisma.evidence.findMany({ where: { request: { userId: u.id } }, select: { storageKey: true } });
    await this.prisma.$transaction([
      this.prisma.privacyRequest.deleteMany({ where: { userId: u.id } }),
      this.prisma.emailDelivery.deleteMany({ where: { toAddress: u.email } }), // email pengingat tanpa requestId
      this.prisma.user.update({
        where: { id: u.id },
        data: {
          deletedAt: new Date(),
          email: `deleted+${u.id}@hakdata.invalid`,
          name: "Akun dihapus",
          passwordHash: "!",
          tokenVersion: { increment: 1 },
        },
      }),
      this.prisma.notification.deleteMany({ where: { userId: u.id } }),
    ]);
    // berkas fisik dihapus setelah commit: gagal di sini hanya menyisakan berkas bernama acak tanpa pemilik, bukan data yang masih tertaut
    await Promise.all(files.map((f) => removeFile(f.storageKey).catch(() => undefined)));
    clearSessionCookies(ctx.res);
    return true;
  }
}
@Module({ providers: [AuthService, AuthResolver] })
export class AuthModule {}
