// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { BadRequestException, Controller, Get, Module, NotFoundException, Param, Post, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { createHash } from "crypto";
import { fromBuffer } from "file-type";
import { PrismaService } from "../prisma.service";
import { AuthUser, CurrentUser } from "../common/auth";
import { config } from "../common/config";
import { fileStream, removeFile, saveFile } from "../common/files";
import { DataExportT, RequestSummaryT, RequestT } from "../gql/types";
import { JSONScalar } from "../gql/types";
import { RequestsService } from "./requests.service";

@Resolver() export class RequestsResolver {
  constructor(private s: RequestsService) {}
  @Query(() => [RequestSummaryT]) myRequests(@CurrentUser() u: AuthUser) { return this.s.list(u); }
  @Query(() => RequestT) request(@CurrentUser() u: AuthUser, @Args("id") id: string) { return this.s.detail(u, id); }
  @Query(() => String) followUpLetter(@CurrentUser() u: AuthUser, @Args("id") id: string) { return this.s.followUpLetter(u, id); }
  @Query(() => String) dossierExport(@CurrentUser() u: AuthUser, @Args("id") id: string) { return this.s.exportDossier(u, id); }
  @Query(() => DataExportT) myDataExport(@CurrentUser() u: AuthUser) { return this.s.exportMyData(u).then((data) => ({ data })); }

  @Mutation(() => RequestT) async createRequest(@CurrentUser() u: AuthUser, @Args("companyId") c: string, @Args("rightCode") r: string, @Args("channelId", { nullable: true }) ch?: string) {
    const created = await this.s.create(u, c, r, ch); return this.s.detail(u, created.id);
  }
  @Mutation(() => RequestT) async updateRequestFields(@CurrentUser() u: AuthUser, @Args("id") id: string, @Args("fields", { type: () => JSONScalar }) f: Record<string, unknown>, @Args("channelId", { nullable: true }) ch?: string) {
    await this.s.updateFields(u, id, f, ch); return this.s.detail(u, id);
  }
  @Mutation(() => RequestT) async generateLetter(@CurrentUser() u: AuthUser, @Args("id") id: string) { await this.s.generateLetter(u, id); return this.s.detail(u, id); }
  @Mutation(() => RequestT) async updateLetter(@CurrentUser() u: AuthUser, @Args("id") id: string, @Args("body") b: string) { await this.s.updateLetter(u, id, b); return this.s.detail(u, id); }
  @Mutation(() => RequestT) async reviewRequest(@CurrentUser() u: AuthUser, @Args("id") id: string) { await this.s.review(u, id); return this.s.detail(u, id); }
  @Mutation(() => RequestT) recordRequestSent(@CurrentUser() u: AuthUser, @Args("id") id: string, @Args("sentVia") via: string,
    @Args("sentAt", { type: () => Date, nullable: true }) sentAt?: Date, @Args("receivedAt", { type: () => Date, nullable: true }) receivedAt?: Date, @Args("followUpDays", { type: () => Int, nullable: true }) f?: number) {
    return this.s.recordSent(u, id, { sentVia: via, sentAt, receivedAt, followUpDays: f });
  }
  @Mutation(() => RequestT) recordReceipt(@CurrentUser() u: AuthUser, @Args("id") id: string, @Args("receivedAt", { type: () => Date }) at: Date) { return this.s.setReceivedAt(u, id, at); }
  @Mutation(() => RequestT) addCompanyResponse(@CurrentUser() u: AuthUser, @Args("id") id: string, @Args("category") category: string, @Args("note", { nullable: true }) note?: string,
    @Args("receivedAt", { type: () => Date, nullable: true }) at?: Date, @Args("evidenceId", { nullable: true }) ev?: string) {
    if (!["ACKNOWLEDGED", "ADDITIONAL_INFO_REQUESTED", "IN_PROGRESS", "FULFILLED", "PARTIALLY_FULFILLED", "REJECTED", "NO_RESPONSE", "OTHER"].includes(category)) throw new BadRequestException("Kategori respons tidak valid.");
    return this.s.addResponse(u, id, { category, note, receivedAt: at, evidenceId: ev });
  }
  @Mutation(() => RequestT) addTimelineNote(@CurrentUser() u: AuthUser, @Args("id") id: string, @Args("text") t: string) { return this.s.addNote(u, id, t); }
  @Mutation(() => RequestT) completeRequest(@CurrentUser() u: AuthUser, @Args("id") id: string) { return this.s.finish(u, id, "COMPLETED"); }
  @Mutation(() => RequestT) closeRequest(@CurrentUser() u: AuthUser, @Args("id") id: string) { return this.s.finish(u, id, "CLOSED"); }
}

const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
@Controller("evidence") export class EvidenceController {
  constructor(private prisma: PrismaService, private requests: RequestsService) {}
  @Post(":requestId") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: config.maxUploadBytes, files: 1 } }))
  async upload(@Param("requestId") requestId: string, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: { user: AuthUser }) {
    if (!file) throw new BadRequestException("Berkas tidak ditemukan.");
    const r = await this.prisma.privacyRequest.findFirst({ where: { id: requestId, userId: req.user.id, deletedAt: null } });
    if (!r) throw new NotFoundException("Permintaan tidak ditemukan.");
    if (r.status === "CLOSED") throw new BadRequestException("Permintaan sudah ditutup.");
    const type = await fromBuffer(file.buffer); // validasi isi sebenarnya (magic bytes), bukan ekstensi/header klien
    if (!type || !ALLOWED.has(type.mime)) throw new BadRequestException("Jenis berkas tidak didukung. Gunakan PDF, PNG, JPG, atau WEBP.");
    const key = await saveFile(file.buffer);
    const safeName = file.originalname.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const e = await tx.evidence.create({ data: { requestId, storageKey: key, originalName: safeName, mime: type.mime, size: file.size, sha256: createHash("sha256").update(file.buffer).digest("hex") } });
        await tx.timelineEvent.create({ data: { requestId, type: "EVIDENCE_UPLOADED", actor: "USER", description: `Bukti diunggah: ${safeName}`, verification: "USER_UPLOADED", evidenceId: e.id } });
        return { id: e.id, originalName: e.originalName, mime: e.mime, size: e.size, sha256: e.sha256, source: e.source };
      });
    } catch (e) { await removeFile(key); throw e; } // jangan tinggalkan file yatim bila DB gagal
  }
  @Get(":id/download") async download(@Param("id") id: string, @Req() req: { user: AuthUser }, @Res() res: any) {
    const e = await this.prisma.evidence.findFirst({ where: { id, request: { userId: req.user.id, deletedAt: null } } });
    if (!e) throw new NotFoundException("Bukti tidak ditemukan.");
    res.set({ "Content-Type": e.mime, "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(e.originalName)}`, "Cache-Control": "private, no-store" });
    fileStream(e.storageKey).pipe(res);
  }
}
@Module({ providers: [RequestsService, RequestsResolver], controllers: [EvidenceController], exports: [RequestsService] }) export class RequestsModule {}
