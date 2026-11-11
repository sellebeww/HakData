// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import * as jwt from "jsonwebtoken";
import { PrismaService } from "../prisma.service";
import { config } from "./config";

export const COOKIE = "hd_session"; // access token, umur pendek
export const REFRESH_COOKIE = "hd_refresh";
export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_S = 7 * 24 * 3600;
export type TokenType = "access" | "refresh" | "verify";
export type AuthUser = { id: string; email: string; name: string; role: "USER" | "MODERATOR" | "ADMIN" };
export const Public = () => SetMetadata("public", true);
export const Roles = (...r: AuthUser["role"][]) => SetMetadata("roles", r);
export const CurrentUser = createParamDecorator(
  (_d, ctx: ExecutionContext) => GqlExecutionContext.create(ctx).getContext().req.user as AuthUser,
);

/** `typ` mencegah token satu jenis dipakai sebagai jenis lain; `tv` (tokenVersion) memungkinkan pencabutan semua sesi. */
export const signToken = (typ: TokenType, userId: string, tv: number, ttlS: number) =>
  jwt.sign({ sub: userId, typ, tv }, config.jwtSecret, { expiresIn: ttlS, algorithm: "HS256" });

export function readToken(token: string | undefined, typ: TokenType): { sub: string; tv: number } | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as { sub: string; typ: TokenType; tv: number };
    return p.typ === typ ? p : null;
  } catch {
    return null;
  }
}

const cookieOpts = (maxAgeS: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.isProd,
  maxAge: maxAgeS * 1000,
  path: "/",
});
export function setSessionCookies(res: { cookie: (...a: unknown[]) => void }, userId: string, tv: number) {
  res.cookie(COOKIE, signToken("access", userId, tv, ACCESS_TTL_S), cookieOpts(ACCESS_TTL_S));
  res.cookie(REFRESH_COOKIE, signToken("refresh", userId, tv, REFRESH_TTL_S), cookieOpts(REFRESH_TTL_S));
}
export function clearSessionCookies(res: { clearCookie: (...a: unknown[]) => void }) {
  for (const c of [COOKIE, REFRESH_COOKIE]) res.clearCookie(c, { path: "/" });
}

export function reqOf(ctx: ExecutionContext) {
  return ctx.getType<string>() === "http" ? ctx.switchToHttp().getRequest() : GqlExecutionContext.create(ctx).getContext().req;
}

/** Guard global: memuat user dari DB di setiap request (peran/penghapusan akun langsung berlaku). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = reqOf(ctx);
    const isPublic = this.reflector.getAllAndOverride<boolean>("public", [ctx.getHandler(), ctx.getClass()]);
    const user = await this.load(req);
    req.user = user;
    if (isPublic) return true;
    if (!user) throw new UnauthorizedException("Silakan masuk terlebih dahulu.");
    const roles = this.reflector.getAllAndOverride<string[]>("roles", [ctx.getHandler(), ctx.getClass()]);
    if (roles && !roles.includes(user.role)) throw new ForbiddenException("Anda tidak memiliki akses untuk tindakan ini.");
    return true;
  }
  private async load(req: { cookies?: Record<string, string> }): Promise<AuthUser | null> {
    const t = readToken(req.cookies?.[COOKIE], "access");
    if (!t) return null;
    const u = await this.prisma.user.findFirst({
      where: { id: t.sub, deletedAt: null, emailVerifiedAt: { not: null }, tokenVersion: t.tv },
      select: { id: true, email: true, name: true, role: true },
    });
    return u as AuthUser | null;
  }
}
