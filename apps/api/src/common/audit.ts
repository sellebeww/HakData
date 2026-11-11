// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Global, Injectable, Module } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  log(actorId: string | null, action: string, entity: string, entityId?: string, meta?: Prisma.InputJsonValue, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return tx.auditLog.create({ data: { actorId, action, entity, entityId, meta } });
  }
}
@Global() @Module({ providers: [AuditService], exports: [AuditService] }) export class AuditModule {}
