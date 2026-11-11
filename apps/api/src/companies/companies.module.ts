// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { BadRequestException, ForbiddenException, Injectable, Module, NotFoundException } from "@nestjs/common";
import { Args, Field, InputType, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AuditService } from "../common/audit";
import { AuthUser, CurrentUser, Public, Roles } from "../common/auth";
import { CompanyPageT, CompanyT, ChannelT, SubmissionT } from "../gql/types";

@InputType() class CompanyInput {
  @Field({ nullable: true }) id?: string; @Field() name: string; @Field({ nullable: true }) brand?: string; @Field({ nullable: true }) legalName?: string;
  @Field() industry: string; @Field({ nullable: true }) website?: string; @Field({ nullable: true }) notes?: string;
}
@InputType() class ChannelInput {
  @Field({ nullable: true }) id?: string; @Field() companyId: string; @Field() type: string; @Field() value: string; @Field() status: string;
  @Field({ nullable: true }) sourceUrl?: string; @Field({ nullable: true }) note?: string;
}
const TYPES = ["PRIVACY_EMAIL", "DPO_EMAIL", "REQUEST_FORM", "POSTAL_ADDRESS", "PRIVACY_POLICY_URL"];
const STATUSES = ["VERIFIED", "COMMUNITY_REPORTED", "UNVERIFIED", "OUTDATED"];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Validasi nilai kanal per tipe. Tidak pernah menebak/mengarang alamat. */
export function validateChannelValue(type: string, value: string) {
  if (!TYPES.includes(type)) throw new BadRequestException("Tipe kanal tidak valid.");
  const v = value.trim();
  if (type.endsWith("_EMAIL") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new BadRequestException("Format email tidak valid.");
  if (["REQUEST_FORM", "PRIVACY_POLICY_URL"].includes(type)) { try { if (new URL(v).protocol !== "https:") throw 0; } catch { throw new BadRequestException("URL harus berformat https://..."); } }
  if (type === "POSTAL_ADDRESS" && v.length < 10) throw new BadRequestException("Alamat terlalu pendek.");
  return v;
}

@Injectable() export class CompaniesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}
  private inc = { channels: { orderBy: { type: "asc" as const } } };
  async list(a: { search?: string; industry?: string; status?: string; take: number; skip: number }) {
    const where: Prisma.CompanyWhereInput = {
      ...(a.search ? { OR: [{ name: { contains: a.search, mode: "insensitive" } }, { brand: { contains: a.search, mode: "insensitive" } }, { legalName: { contains: a.search, mode: "insensitive" } }] } : {}),
      ...(a.industry ? { industry: a.industry } : {}),
      ...(a.status ? { channels: { some: { status: a.status as never } } } : {}),
    };
    const take = Math.min(Math.max(a.take, 1), 50);
    const [items, total] = await Promise.all([this.prisma.company.findMany({ where, include: this.inc, orderBy: { name: "asc" }, take, skip: Math.max(a.skip, 0) }), this.prisma.company.count({ where })]);
    return { items, total };
  }
  async bySlug(slug: string) { const c = await this.prisma.company.findUnique({ where: { slug }, include: this.inc }); if (!c) throw new NotFoundException("Perusahaan tidak ditemukan."); return c; }
  async upsertCompany(actor: AuthUser, i: CompanyInput) {
    if (!i.name.trim() || !i.industry.trim()) throw new BadRequestException("Nama dan industri wajib diisi.");
    const data = { name: i.name.trim(), brand: i.brand, legalName: i.legalName, industry: i.industry.trim(), website: i.website, notes: i.notes };
    const c = i.id ? await this.prisma.company.update({ where: { id: i.id }, data, include: this.inc }) : await this.prisma.company.create({ data: { ...data, slug: slugify(i.name) + "-" + Math.random().toString(36).slice(2, 6) }, include: this.inc });
    await this.audit.log(actor.id, i.id ? "COMPANY_UPDATED" : "COMPANY_CREATED", "Company", c.id);
    return c;
  }
  async upsertChannel(actor: AuthUser, i: ChannelInput) {
    if (!STATUSES.includes(i.status)) throw new BadRequestException("Status verifikasi tidak valid.");
    if (i.status === "VERIFIED" && actor.role !== "ADMIN") throw new ForbiddenException("Hanya admin yang dapat menandai VERIFIED.");
    if (["VERIFIED", "COMMUNITY_REPORTED"].includes(i.status) && !i.sourceUrl) throw new BadRequestException("Sumber informasi wajib untuk status ini.");
    const value = validateChannelValue(i.type, i.value);
    const data = { type: i.type as never, value, status: i.status as never, sourceUrl: i.sourceUrl, note: i.note, lastCheckedAt: new Date() };
    const ch = i.id ? await this.prisma.privacyChannel.update({ where: { id: i.id }, data })
      : await this.prisma.privacyChannel.upsert({ where: { companyId_type_value: { companyId: i.companyId, type: data.type, value } }, create: { ...data, companyId: i.companyId }, update: data });
    await this.audit.log(actor.id, "CHANNEL_UPSERTED", "PrivacyChannel", ch.id, { status: i.status });
    return ch;
  }
  /** Kontribusi komunitas: wajib sumber, dibatasi 5 pending per pengguna, tanpa duplikat. */
  async submit(user: AuthUser, companyId: string, type: string, value: string, sourceUrl: string) {
    const v = validateChannelValue(type, value); validateChannelValue("PRIVACY_POLICY_URL", sourceUrl);
    if (!(await this.prisma.company.findUnique({ where: { id: companyId } }))) throw new NotFoundException("Perusahaan tidak ditemukan.");
    if (await this.prisma.channelSubmission.count({ where: { userId: user.id, status: "PENDING" } }) >= 5) throw new BadRequestException("Anda sudah memiliki 5 usulan yang menunggu moderasi.");
    if (await this.prisma.channelSubmission.findFirst({ where: { companyId, type: type as never, value: v, status: "PENDING" } })) throw new BadRequestException("Usulan serupa sudah menunggu moderasi.");
    return this.prisma.channelSubmission.create({ data: { companyId, userId: user.id, type: type as never, value: v, sourceUrl }, include: { company: true } });
  }
  async review(actor: AuthUser, id: string, approve: boolean, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.channelSubmission.findUnique({ where: { id }, include: { company: true } });
      if (!s || s.status !== "PENDING") throw new BadRequestException("Usulan tidak ditemukan atau sudah ditinjau.");
      if (approve) await tx.privacyChannel.upsert({ where: { companyId_type_value: { companyId: s.companyId, type: s.type, value: s.value } },
        create: { companyId: s.companyId, type: s.type, value: s.value, status: "COMMUNITY_REPORTED", sourceUrl: s.sourceUrl, lastCheckedAt: new Date(), note: "Usulan komunitas, disetujui moderator" },
        update: { status: "COMMUNITY_REPORTED", sourceUrl: s.sourceUrl, lastCheckedAt: new Date() } });
      const u = await tx.channelSubmission.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", reviewNote: note }, include: { company: true } });
      await this.audit.log(actor.id, approve ? "SUBMISSION_APPROVED" : "SUBMISSION_REJECTED", "ChannelSubmission", id, undefined, tx as never);
      return u;
    });
  }
  pending() { return this.prisma.channelSubmission.findMany({ where: { status: "PENDING" }, include: { company: true }, orderBy: { createdAt: "asc" } }); }
  industries() { return this.prisma.company.findMany({ distinct: ["industry"], select: { industry: true }, orderBy: { industry: "asc" } }).then((r) => r.map((x) => x.industry)); }
}
const toSub = (s: { id: string; company: { name: string }; type: string; value: string; sourceUrl: string; status: string; reviewNote: string | null; createdAt: Date }) =>
  ({ id: s.id, companyName: s.company.name, type: s.type, value: s.value, sourceUrl: s.sourceUrl, status: s.status, reviewNote: s.reviewNote ?? undefined, createdAt: s.createdAt });

@Resolver() export class CompaniesResolver {
  constructor(private s: CompaniesService) {}
  @Public() @Query(() => CompanyPageT) companies(@Args("search", { nullable: true }) search?: string, @Args("industry", { nullable: true }) industry?: string,
    @Args("status", { nullable: true }) status?: string, @Args("take", { type: () => Int, defaultValue: 12 }) take = 12, @Args("skip", { type: () => Int, defaultValue: 0 }) skip = 0) {
    return this.s.list({ search, industry, status, take, skip });
  }
  @Public() @Query(() => CompanyT) company(@Args("slug") slug: string) { return this.s.bySlug(slug); }
  @Public() @Query(() => [String]) industries() { return this.s.industries(); }
  @Roles("MODERATOR", "ADMIN") @Mutation(() => CompanyT) upsertCompany(@CurrentUser() u: AuthUser, @Args("input") i: CompanyInput) { return this.s.upsertCompany(u, i); }
  @Roles("MODERATOR", "ADMIN") @Mutation(() => ChannelT) upsertChannel(@CurrentUser() u: AuthUser, @Args("input") i: ChannelInput) { return this.s.upsertChannel(u, i); }
  @Mutation(() => SubmissionT) async submitChannel(@CurrentUser() u: AuthUser, @Args("companyId") c: string, @Args("type") t: string, @Args("value") v: string, @Args("sourceUrl") s: string) { return toSub(await this.s.submit(u, c, t, v, s)); }
  @Roles("MODERATOR", "ADMIN") @Query(() => [SubmissionT]) async pendingSubmissions() { return (await this.s.pending()).map(toSub); }
  @Roles("MODERATOR", "ADMIN") @Mutation(() => SubmissionT) async reviewSubmission(@CurrentUser() u: AuthUser, @Args("id") id: string, @Args("approve") a: boolean, @Args("note", { nullable: true }) n?: string) { return toSub(await this.s.review(u, id, a, n)); }
}
@Module({ providers: [CompaniesService, CompaniesResolver] }) export class CompaniesModule {}
