// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { BadRequestException, ForbiddenException, Injectable, Module, NotFoundException } from "@nestjs/common";
import { Args, Context, Field, InputType, Int, Mutation, Parent, Query, ResolveField, Resolver } from "@nestjs/graphql";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AuditService } from "../common/audit";
import { AuthUser, CurrentUser, Public, Roles } from "../common/auth";
import { CompanyConnectionT, CompanyPageT, CompanyT, ChannelT, SubmissionT } from "../gql/types";

@InputType()
class CompanyInput {
  @Field({ nullable: true }) id?: string;
  @Field() name: string;
  @Field({ nullable: true }) brand?: string;
  @Field({ nullable: true }) legalName?: string;
  @Field() industry: string;
  @Field({ nullable: true }) website?: string;
  @Field({ nullable: true }) notes?: string;
}
@InputType()
class ChannelInput {
  @Field({ nullable: true }) id?: string;
  @Field() companyId: string;
  @Field() type: string;
  @Field() value: string;
  @Field() status: string;
  @Field({ nullable: true }) sourceUrl?: string;
  @Field({ nullable: true }) note?: string;
}
const TYPES = ["PRIVACY_EMAIL", "DPO_EMAIL", "REQUEST_FORM", "POSTAL_ADDRESS", "PRIVACY_POLICY_URL"];
const STATUSES = ["UNVERIFIED", "COMMUNITY_VERIFIED", "OFFICIAL"];
const MAX_PAGE = 50;
/** shortcut: pengganti `dataloader` (registry npm tak terjangkau saat dibuat); sama-sama batch per tick, tanpa cache lintas request. Ganti ke paket bila sudah terpasang. */
function batchLoader<V>(fn: (keys: string[]) => Promise<V[]>) {
  const pending = new Map<string, { resolve: (v: V) => void; reject: (e: unknown) => void }[]>();
  const flush = async () => {
    const batch = [...pending];
    pending.clear();
    try {
      const vals = await fn(batch.map(([k]) => k));
      batch.forEach(([, ws], i) => ws.forEach((w) => w.resolve(vals[i])));
    } catch (e) {
      batch.forEach(([, ws]) => ws.forEach((w) => w.reject(e)));
    }
  };
  return {
    load: (key: string) =>
      new Promise<V>((resolve, reject) => {
        if (!pending.size) queueMicrotask(flush);
        pending.set(key, [...(pending.get(key) ?? []), { resolve, reject }]);
      }),
  };
}
type ChannelLoader = ReturnType<typeof batchLoader<Prisma.PrivacyChannelGetPayload<object>[]>>;
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/** Validasi nilai kanal per tipe. Tidak pernah menebak/mengarang alamat. */
export function validateChannelValue(type: string, value: string) {
  if (!TYPES.includes(type)) throw new BadRequestException("Tipe kanal tidak valid.");
  const v = value.trim();
  if (type.endsWith("_EMAIL") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new BadRequestException("Format email tidak valid.");
  if (["REQUEST_FORM", "PRIVACY_POLICY_URL"].includes(type)) {
    try {
      if (new URL(v).protocol !== "https:") throw 0;
    } catch {
      throw new BadRequestException("URL harus berformat https://...");
    }
  }
  if (type === "POSTAL_ADDRESS" && v.length < 10) throw new BadRequestException("Alamat terlalu pendek.");
  return v;
}

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}
  /** Kanal per perusahaan dimuat sekali per request (DataLoader), tidak per baris. */
  channelsLoader() {
    return batchLoader(async (ids) => {
      const rows = await this.prisma.privacyChannel.findMany({ where: { companyId: { in: ids } }, orderBy: { type: "asc" } });
      return ids.map((id) => rows.filter((r) => r.companyId === id));
    });
  }
  private where(a: { search?: string; industry?: string; status?: string }): Prisma.CompanyWhereInput {
    if (a.status && !STATUSES.includes(a.status)) throw new BadRequestException("Status verifikasi tidak valid.");
    return {
      ...(a.search
        ? {
            OR: [
              { name: { contains: a.search, mode: "insensitive" } },
              { brand: { contains: a.search, mode: "insensitive" } },
              { legalName: { contains: a.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(a.industry ? { industry: a.industry } : {}),
      ...(a.status ? { channels: { some: { status: a.status as never } } } : {}),
    };
  }
  async list(a: { search?: string; industry?: string; status?: string; take: number; skip: number }) {
    const where = this.where(a);
    const take = Math.min(Math.max(a.take, 1), MAX_PAGE);
    const [items, total] = await Promise.all([
      this.prisma.company.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], take, skip: Math.max(a.skip, 0) }),
      this.prisma.company.count({ where }),
    ]);
    return { items, total };
  }
  /** Cursor = id perusahaan (base64); urutan stabil (name, id). */
  async connection(a: { search?: string; industry?: string; status?: string; first: number; after?: string }) {
    const first = Math.min(Math.max(a.first, 1), MAX_PAGE);
    const id = a.after ? Buffer.from(a.after, "base64url").toString() : undefined;
    if (id && !(await this.prisma.company.findUnique({ where: { id }, select: { id: true } })))
      throw new BadRequestException("Cursor tidak valid.");
    const rows = await this.prisma.company.findMany({
      where: this.where(a),
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: first + 1,
      ...(id ? { cursor: { id }, skip: 1 } : {}),
    });
    const page = rows.slice(0, first);
    const edges = page.map((node) => ({ node, cursor: Buffer.from(node.id).toString("base64url") }));
    return { edges, pageInfo: { endCursor: edges.at(-1)?.cursor, hasNextPage: rows.length > first } };
  }
  async bySlug(slug: string) {
    const c = await this.prisma.company.findUnique({ where: { slug } });
    if (!c) throw new NotFoundException("Perusahaan tidak ditemukan.");
    return c;
  }
  async upsertCompany(actor: AuthUser, i: CompanyInput) {
    if (!i.name.trim() || !i.industry.trim()) throw new BadRequestException("Nama dan industri wajib diisi.");
    if (i.website) i.website = validateChannelValue("PRIVACY_POLICY_URL", i.website); // dirender sebagai tautan publik: hanya https://
    const data = {
      name: i.name.trim(),
      brand: i.brand,
      legalName: i.legalName,
      industry: i.industry.trim(),
      website: i.website,
      notes: i.notes,
    };
    const c = i.id
      ? await this.prisma.company.update({ where: { id: i.id }, data })
      : await this.prisma.company.create({
          data: { ...data, slug: slugify(i.name) + "-" + Math.random().toString(36).slice(2, 6) },
        });
    await this.audit.log(actor.id, i.id ? "COMPANY_UPDATED" : "COMPANY_CREATED", "Company", c.id);
    return c;
  }
  async upsertChannel(actor: AuthUser, i: ChannelInput) {
    if (!STATUSES.includes(i.status)) throw new BadRequestException("Status verifikasi tidak valid.");
    if (i.status !== "UNVERIFIED" && actor.role !== "ADMIN") throw new ForbiddenException("Hanya admin yang dapat memverifikasi kanal.");
    if (i.status !== "UNVERIFIED" && !i.sourceUrl) throw new BadRequestException("Sumber informasi wajib untuk status ini.");
    const value = validateChannelValue(i.type, i.value);
    const data = {
      type: i.type as never,
      value,
      status: i.status as never,
      sourceUrl: i.sourceUrl,
      note: i.note,
      lastCheckedAt: new Date(),
    };
    const ch = i.id
      ? await this.prisma.privacyChannel.update({ where: { id: i.id }, data })
      : await this.prisma.privacyChannel.upsert({
          where: { companyId_type_value: { companyId: i.companyId, type: data.type, value } },
          create: { ...data, companyId: i.companyId },
          update: data,
        });
    await this.audit.log(actor.id, "CHANNEL_UPSERTED", "PrivacyChannel", ch.id, { status: i.status });
    return ch;
  }
  /** Kontribusi komunitas: wajib sumber, dibatasi 5 pending per pengguna, tanpa duplikat. */
  async submit(user: AuthUser, companyId: string, type: string, value: string, sourceUrl: string) {
    const v = validateChannelValue(type, value);
    validateChannelValue("PRIVACY_POLICY_URL", sourceUrl);
    if (!(await this.prisma.company.findUnique({ where: { id: companyId } }))) throw new NotFoundException("Perusahaan tidak ditemukan.");
    if ((await this.prisma.channelSubmission.count({ where: { userId: user.id, status: "PENDING" } })) >= 5)
      throw new BadRequestException("Anda sudah memiliki 5 usulan yang menunggu moderasi.");
    if (await this.prisma.channelSubmission.findFirst({ where: { companyId, type: type as never, value: v, status: "PENDING" } }))
      throw new BadRequestException("Usulan serupa sudah menunggu moderasi.");
    return this.prisma.channelSubmission.create({
      data: { companyId, userId: user.id, type: type as never, value: v, sourceUrl },
      include: { company: true },
    });
  }
  async review(actor: AuthUser, id: string, approve: boolean, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.channelSubmission.findUnique({ where: { id }, include: { company: true } });
      if (!s || s.status !== "PENDING") throw new BadRequestException("Usulan tidak ditemukan atau sudah ditinjau.");
      if (approve)
        await tx.privacyChannel.upsert({
          where: { companyId_type_value: { companyId: s.companyId, type: s.type, value: s.value } },
          create: {
            companyId: s.companyId,
            type: s.type,
            value: s.value,
            status: "COMMUNITY_VERIFIED",
            sourceUrl: s.sourceUrl,
            lastCheckedAt: new Date(),
            note: "Usulan komunitas, disetujui moderator",
          },
          update: { status: "COMMUNITY_VERIFIED", sourceUrl: s.sourceUrl, lastCheckedAt: new Date() },
        });
      const u = await tx.channelSubmission.update({
        where: { id },
        data: { status: approve ? "APPROVED" : "REJECTED", reviewNote: note },
        include: { company: true },
      });
      await this.audit.log(
        actor.id,
        approve ? "SUBMISSION_APPROVED" : "SUBMISSION_REJECTED",
        "ChannelSubmission",
        id,
        undefined,
        tx as never,
      );
      return u;
    });
  }
  async deleteChannel(actor: AuthUser, id: string) {
    const ch = await this.prisma.privacyChannel.findUnique({ where: { id } });
    if (!ch) throw new NotFoundException("Kanal tidak ditemukan.");
    await this.prisma.privacyChannel.delete({ where: { id } });
    await this.audit.log(actor.id, "CHANNEL_DELETED", "PrivacyChannel", id);
    return true;
  }
  pending() {
    return this.prisma.channelSubmission.findMany({
      where: { status: "PENDING" },
      include: { company: true },
      orderBy: { createdAt: "asc" },
    });
  }
  industries() {
    return this.prisma.company
      .findMany({ distinct: ["industry"], select: { industry: true }, orderBy: { industry: "asc" } })
      .then((r) => r.map((x) => x.industry));
  }
}
const toSub = (s: {
  id: string;
  company: { name: string };
  type: string;
  value: string;
  sourceUrl: string;
  status: string;
  reviewNote: string | null;
  createdAt: Date;
}) => ({
  id: s.id,
  companyName: s.company.name,
  type: s.type,
  value: s.value,
  sourceUrl: s.sourceUrl,
  status: s.status,
  reviewNote: s.reviewNote ?? undefined,
  createdAt: s.createdAt,
});

@Resolver()
export class CompaniesResolver {
  constructor(private s: CompaniesService) {}
  @Public() @Query(() => CompanyPageT) companies(
    @Args("search", { nullable: true }) search?: string,
    @Args("industry", { nullable: true }) industry?: string,
    @Args("status", { nullable: true }) status?: string,
    @Args("take", { type: () => Int, defaultValue: 12 }) take = 12,
    @Args("skip", { type: () => Int, defaultValue: 0 }) skip = 0,
  ) {
    return this.s.list({ search, industry, status, take, skip });
  }
  @Public() @Query(() => CompanyConnectionT) companiesConnection(
    @Args("search", { nullable: true }) search?: string,
    @Args("industry", { nullable: true }) industry?: string,
    @Args("status", { nullable: true }) status?: string,
    @Args("first", { type: () => Int, defaultValue: 12 }) first = 12,
    @Args("after", { nullable: true }) after?: string,
  ) {
    return this.s.connection({ search, industry, status, first, after });
  }
  @Public() @Query(() => CompanyT) company(@Args("slug") slug: string) {
    return this.s.bySlug(slug);
  }
  @Public() @Query(() => [String]) industries() {
    return this.s.industries();
  }
  @Roles("ADMIN") @Mutation(() => CompanyT) upsertCompany(@CurrentUser() u: AuthUser, @Args("input") i: CompanyInput) {
    return this.s.upsertCompany(u, i);
  }
  @Roles("ADMIN") @Mutation(() => ChannelT) upsertChannel(@CurrentUser() u: AuthUser, @Args("input") i: ChannelInput) {
    return this.s.upsertChannel(u, i);
  }
  @Roles("ADMIN") @Mutation(() => Boolean) deleteChannel(@CurrentUser() u: AuthUser, @Args("id") id: string) {
    return this.s.deleteChannel(u, id);
  }
  @Mutation(() => SubmissionT) async submitChannel(
    @CurrentUser() u: AuthUser,
    @Args("companyId") c: string,
    @Args("type") t: string,
    @Args("value") v: string,
    @Args("sourceUrl") s: string,
  ) {
    return toSub(await this.s.submit(u, c, t, v, s));
  }
  @Roles("ADMIN") @Query(() => [SubmissionT]) async pendingSubmissions() {
    return (await this.s.pending()).map(toSub);
  }
  @Roles("ADMIN") @Mutation(() => SubmissionT) async reviewSubmission(
    @CurrentUser() u: AuthUser,
    @Args("id") id: string,
    @Args("approve") a: boolean,
    @Args("note", { nullable: true }) n?: string,
  ) {
    return toSub(await this.s.review(u, id, a, n));
  }
}
@Resolver(() => CompanyT)
export class CompanyFieldsResolver {
  constructor(private s: CompaniesService) {}
  @ResolveField(() => [ChannelT]) channels(@Parent() c: { id: string }, @Context() ctx: { req: { channelsLoader?: ChannelLoader } }) {
    return (ctx.req.channelsLoader ??= this.s.channelsLoader()).load(c.id);
  }
}
@Module({ providers: [CompaniesService, CompaniesResolver, CompanyFieldsResolver] })
export class CompaniesModule {}
