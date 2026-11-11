// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Module } from "@nestjs/common";
import { Args, Int, Query, Resolver } from "@nestjs/graphql";
import { PrismaService } from "../prisma.service";
import { Roles } from "../common/auth";
import { AuditLogT } from "../gql/types";

@Resolver() export class AdminResolver {
  constructor(private prisma: PrismaService) {}
  /** Audit log hanya dapat dibaca (tidak ada mutation untuk mengubah/menghapus). */
  @Roles("ADMIN") @Query(() => [AuditLogT]) auditLogs(@Args("take", { type: () => Int, defaultValue: 100 }) take: number) {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(take, 500) });
  }
}
@Module({ providers: [AdminResolver] }) export class AdminModule {}
