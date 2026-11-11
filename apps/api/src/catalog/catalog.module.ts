// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { BadRequestException, Injectable, Module } from "@nestjs/common";
import { Args, Field, InputType, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { PrismaService } from "../prisma.service";
import { AuditService } from "../common/audit";
import { AuthUser, CurrentUser, Public, Roles } from "../common/auth";
import { LegalRuleT, RightT } from "../gql/types";
import { rightByCode } from "../domain/rights.catalog";

@InputType()
class PublishRuleInput {
  @Field() rightCode: string;
  @Field() legalBasis: string;
  @Field(() => Int, { nullable: true }) durationHours?: number;
  @Field() status: string;
  @Field({ nullable: true }) exceptions?: string;
  @Field({ nullable: true }) applicability?: string;
  @Field(() => Date) effectiveFrom: Date;
  @Field() verifiedBy: string;
}

@Injectable()
export class CatalogService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}
  async rights() {
    const rows = await this.prisma.dataRight.findMany({ orderBy: { sortOrder: "asc" } });
    return rows.map((r) => ({ ...r, fields: (rightByCode(r.code)?.fields ?? []).map((f) => ({ ...f, multiline: !!f.multiline })) }));
  }
  currentRules() {
    return this.prisma.legalRule.findMany({ where: { supersededAt: null }, orderBy: { rightCode: "asc" } });
  }
  allRules() {
    return this.prisma.legalRule.findMany({ orderBy: [{ rightCode: "asc" }, { version: "desc" }] });
  }
  /** Aturan baru = versi baru; versi lama tetap utuh dan hanya ditandai digantikan. */
  async publishRule(actor: AuthUser, i: PublishRuleInput) {
    if (!["VERIFIED", "NEEDS_CONFIRMATION", "NOT_VERIFIED"].includes(i.status)) throw new BadRequestException("Status aturan tidak valid.");
    if (i.status !== "NOT_VERIFIED" && !i.durationHours) throw new BadRequestException("Aturan terverifikasi wajib memiliki durasi jam.");
    if (i.durationHours != null && i.durationHours <= 0) throw new BadRequestException("Durasi harus positif.");
    if (!(await this.prisma.dataRight.findUnique({ where: { code: i.rightCode } }))) throw new BadRequestException("Hak tidak dikenal.");
    return this.prisma.$transaction(async (tx) => {
      const prev = await tx.legalRule.findFirst({ where: { ruleKey: i.rightCode }, orderBy: { version: "desc" } });
      if (prev)
        await tx.legalRule.updateMany({ where: { ruleKey: i.rightCode, supersededAt: null }, data: { supersededAt: i.effectiveFrom } });
      const rule = await tx.legalRule.create({
        data: {
          ruleKey: i.rightCode,
          version: (prev?.version ?? 0) + 1,
          rightCode: i.rightCode,
          legalBasis: i.legalBasis,
          durationHours: i.durationHours ?? null,
          status: i.status as never,
          exceptions: i.exceptions,
          applicability: i.applicability,
          effectiveFrom: i.effectiveFrom,
          verifiedBy: i.verifiedBy,
          lastReviewedAt: new Date(),
        },
      });
      await this.audit.log(
        actor.id,
        "LEGAL_RULE_PUBLISHED",
        "LegalRule",
        rule.id,
        { rightCode: i.rightCode, version: rule.version, status: i.status, durationHours: i.durationHours ?? null },
        tx as never,
      );
      return rule;
    });
  }
}

@Resolver()
export class CatalogResolver {
  constructor(private s: CatalogService) {}
  @Public() @Query(() => [RightT]) rights() {
    return this.s.rights();
  }
  @Public() @Query(() => [LegalRuleT]) legalRules() {
    return this.s.currentRules();
  }
  @Roles("ADMIN") @Query(() => [LegalRuleT]) adminLegalRules() {
    return this.s.allRules();
  }
  @Roles("ADMIN") @Mutation(() => LegalRuleT) publishLegalRule(@CurrentUser() u: AuthUser, @Args("input") i: PublishRuleInput) {
    return this.s.publishRule(u, i);
  }
}
@Module({ providers: [CatalogService, CatalogResolver], exports: [CatalogService] })
export class CatalogModule {}
