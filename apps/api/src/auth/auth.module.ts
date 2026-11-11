// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { BadRequestException, Injectable, Module, UnauthorizedException } from "@nestjs/common";
import { Args, Context, Mutation, Query, Resolver } from "@nestjs/graphql";
import * as bcrypt from "bcryptjs";
import { IsEmail, IsString, MaxLength, MinLength, validateOrReject } from "class-validator";
import { PrismaService } from "../prisma.service";
import { AuthUser, COOKIE, CurrentUser, Public, signSession } from "../common/auth";
import { config } from "../common/config";
import { UserT } from "../gql/types";
import { removeFile } from "../common/files";

class Creds { @IsEmail() @MaxLength(200) email: string; @IsString() @MinLength(10, { message: "Kata sandi minimal 10 karakter" }) @MaxLength(200) password: string; }

// Batas percobaan login per email (in-memory; satu instance. Untuk multi-instance pindahkan ke Redis/DB).
const fails = new Map<string, { n: number; until: number }>();
const MAX_FAILS = 5, LOCK_MS = 10 * 60_000;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}
  async register(email: string, password: string, name: string) {
    const c = Object.assign(new Creds(), { email: email.trim().toLowerCase(), password });
    await validateOrReject(c).catch((e) => { throw new BadRequestException(Object.values(e[0].constraints).join(", ")); });
    if (!name.trim() || name.length > 100) throw new BadRequestException("Nama wajib diisi (maks. 100 karakter).");
    if (await this.prisma.user.findUnique({ where: { email: c.email } })) throw new BadRequestException("Email sudah terdaftar.");
    return this.prisma.user.create({ data: { email: c.email, name: name.trim(), passwordHash: await bcrypt.hash(password, 12) } });
  }
  async login(email: string, password: string) {
    const key = email.trim().toLowerCase(); const f = fails.get(key);
    if (f && f.n >= MAX_FAILS && f.until > Date.now()) throw new UnauthorizedException("Terlalu banyak percobaan. Coba lagi beberapa menit lagi.");
    const u = await this.prisma.user.findFirst({ where: { email: key, deletedAt: null } });
    // bandingkan hash palsu bila user tak ada agar waktu respons seragam
    const ok = await bcrypt.compare(password, u?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    if (!u || !ok) { fails.set(key, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + LOCK_MS }); throw new UnauthorizedException("Email atau kata sandi salah."); }
    fails.delete(key);
    return u;
  }
}

@Resolver()
export class AuthResolver {
  constructor(private auth: AuthService, private prisma: PrismaService) {}
  private setCookie(res: { cookie: (...a: unknown[]) => void }, id: string) {
    res.cookie(COOKIE, signSession(id), { httpOnly: true, sameSite: "lax", secure: config.isProd, maxAge: 7 * 864e5, path: "/" });
  }
  @Public() @Mutation(() => UserT) async register(@Args("email") e: string, @Args("password") p: string, @Args("name") n: string, @Context() ctx: any) {
    const u = await this.auth.register(e, p, n); this.setCookie(ctx.res, u.id); return u;
  }
  @Public() @Mutation(() => UserT) async login(@Args("email") e: string, @Args("password") p: string, @Context() ctx: any) {
    const u = await this.auth.login(e, p); this.setCookie(ctx.res, u.id); return u;
  }
  @Public() @Mutation(() => Boolean) logout(@Context() ctx: any) { ctx.res.clearCookie(COOKIE, { path: "/" }); return true; }
  @Public() @Query(() => UserT, { nullable: true }) me(@CurrentUser() u: AuthUser | null) { return u; }

  /** Hapus akun: anonimisasi + soft delete. Permintaan tetap ada untuk integritas statistik agregat tanpa identitas. */
  @Mutation(() => Boolean) async deleteMyAccount(@CurrentUser() u: AuthUser, @Context() ctx: any) {
    const files = await this.prisma.evidence.findMany({ where: { request: { userId: u.id } }, select: { id: true, storageKey: true } });
    await this.prisma.evidence.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
    await Promise.all(files.map((f) => removeFile(f.storageKey))); // hapus berkas fisik bukti
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: u.id }, data: { deletedAt: new Date(), email: `deleted+${u.id}@hakdata.invalid`, name: "Akun dihapus", passwordHash: "!" } }),
      this.prisma.privacyRequest.updateMany({ where: { userId: u.id }, data: { fields: {}, letterBody: "", deletedAt: new Date() } }),
      this.prisma.notification.deleteMany({ where: { userId: u.id } }),
    ]);
    ctx.res.clearCookie(COOKIE, { path: "/" });
    return true;
  }
}
@Module({ providers: [AuthService, AuthResolver] }) export class AuthModule {}
