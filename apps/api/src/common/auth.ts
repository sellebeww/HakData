// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import * as jwt from "jsonwebtoken";
import { PrismaService } from "../prisma.service";
import { config } from "./config";

export const COOKIE = "hd_session";
export type AuthUser = { id: string; email: string; name: string; role: "USER" | "MODERATOR" | "ADMIN" };
export const Public = () => SetMetadata("public", true);
export const Roles = (...r: AuthUser["role"][]) => SetMetadata("roles", r);
export const CurrentUser = createParamDecorator((_d, ctx: ExecutionContext) => GqlExecutionContext.create(ctx).getContext().req.user as AuthUser);

export const signSession = (userId: string) => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: "7d" });

export function reqOf(ctx: ExecutionContext) {
  return ctx.getType<string>() === "http" ? ctx.switchToHttp().getRequest() : GqlExecutionContext.create(ctx).getContext().req;
}

/** Guard global: memuat user dari DB di setiap request (peran/penghapusan akun langsung berlaku). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private prisma: PrismaService, private reflector: Reflector) {}
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
    const token = req.cookies?.[COOKIE];
    if (!token) return null;
    try {
      const { sub } = jwt.verify(token, config.jwtSecret) as { sub: string };
      const u = await this.prisma.user.findFirst({ where: { id: sub, deletedAt: null }, select: { id: true, email: true, name: true, role: true } });
      return u as AuthUser | null;
    } catch { return null; }
  }
}
