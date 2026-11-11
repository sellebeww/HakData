// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AuditService } from "../common/audit";
import { AuthUser } from "../common/auth";
import { computeDueAt, deadlineStatus, planReminders, RuleLike, selectRule } from "../domain/deadline.engine";
import { assertTransition, isEditable, ReqStatus } from "../domain/request.state";
import { LetterValidationError, renderLetter, validateFields } from "../domain/letter";
import { rightByCode } from "../domain/rights.catalog";

export const DEADLINE_DISCLAIMER = "Penghitungan ini merupakan estimasi berdasarkan aturan yang tercatat. Silakan periksa ketentuan yang berlaku dan kondisi permintaan Anda.";
const TZ = "Asia/Jakarta";
const MIN_SENT = new Date("2022-10-17T00:00:00Z"); // UU 27/2022 diundangkan
const fmtDate = (d: Date) => new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: TZ }).format(d);
const fmtDateTime = (d: Date) => new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: TZ }).format(d) + " WIB";
type Tx = Prisma.TransactionClient;

const include = { company: { include: { channels: true } }, channel: true, deadline: { include: { rule: true } },
  events: { orderBy: { occurredAt: "asc" as const } }, evidence: { orderBy: { createdAt: "asc" as const } }, responses: { orderBy: { receivedAt: "asc" as const } } };

@Injectable()
export class RequestsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async own(id: string, userId: string, tx: Tx | PrismaService = this.prisma) {
    const r = await tx.privacyRequest.findFirst({ where: { id, userId, deletedAt: null } });
    if (!r) throw new NotFoundException("Permintaan tidak ditemukan."); // 404, bukan 403, agar keberadaan ID tidak bocor
    return r;
  }
  private ev(tx: Tx, requestId: string, type: string, actor: string, description: string, o: { metadata?: Prisma.InputJsonValue; verification?: "USER_UPLOADED" | "SYSTEM_RECORDED"; evidenceId?: string; occurredAt?: Date } = {}) {
    return tx.timelineEvent.create({ data: { requestId, type, actor, description, metadata: o.metadata, verification: o.verification ?? "SYSTEM_RECORDED", evidenceId: o.evidenceId, occurredAt: o.occurredAt } });
  }
  private guard(from: string, to: string) { try { assertTransition(from as ReqStatus, to as ReqStatus); } catch (e) { throw new BadRequestException((e as Error).message); } }

  async create(user: AuthUser, companyId: string, rightCode: string, channelId?: string) {
    const [company, right] = await Promise.all([this.prisma.company.findUnique({ where: { id: companyId } }), this.prisma.dataRight.findUnique({ where: { code: rightCode } })]);
    if (!company || !right) throw new NotFoundException("Perusahaan atau jenis hak tidak ditemukan.");
    if (channelId && !(await this.prisma.privacyChannel.findFirst({ where: { id: channelId, companyId } }))) throw new BadRequestException("Kanal tidak sesuai dengan perusahaan.");
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.privacyRequest.create({ data: { userId: user.id, companyId, rightCode, channelId, title: `${right.title} — ${company.name}`, fields: {} } });
      await this.ev(tx, r.id, "REQUEST_CREATED", "USER", "Permintaan dibuat", { metadata: { company: company.name, right: rightCode } });
      return r;
    });
  }

  async updateFields(user: AuthUser, id: string, fields: Record<string, unknown>, channelId?: string | null) {
    const r = await this.own(id, user.id);
    if (!isEditable(r.status as ReqStatus)) throw new BadRequestException("Permintaan yang sudah dikirim tidak dapat diubah.");
    const def = rightByCode(r.rightCode)!;
    const allowed = new Set(def.fields.map((f) => f.key)); const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields ?? {})) { if (!allowed.has(k)) continue; clean[k] = String(v ?? "").slice(0, 2000); } // anti mass-assignment: hanya kolom yang dikenal
    if (channelId && !(await this.prisma.privacyChannel.findFirst({ where: { id: channelId, companyId: r.companyId } }))) throw new BadRequestException("Kanal tidak sesuai dengan perusahaan.");
    // mengubah isian menggugurkan peninjauan sebelumnya
    return this.prisma.privacyRequest.update({ where: { id }, data: { fields: clean, status: "DRAFT", ...(channelId !== undefined ? { channelId } : {}) } });
  }

  async generateLetter(user: AuthUser, id: string) {
    const r = await this.own(id, user.id);
    if (!isEditable(r.status as ReqStatus)) throw new BadRequestException("Surat tidak dapat dibuat ulang setelah dikirim.");
    const def = rightByCode(r.rightCode)!; const fields = r.fields as Record<string, string>;
    try { validateFields(def.fields, fields); } catch (e) { if (e instanceof LetterValidationError) throw new BadRequestException(e.message); throw e; }
    const [company, tpl] = await Promise.all([this.prisma.company.findUniqueOrThrow({ where: { id: r.companyId } }),
      this.prisma.requestTemplate.findFirstOrThrow({ where: { rightCode: r.rightCode, active: true }, orderBy: { version: "desc" } })]);
    const vals: Record<string, string> = { companyName: company.legalName ?? company.name, subject: `Permohonan ${def.title} Data Pribadi`, date: fmtDate(new Date()), ...fields };
    def.fields.forEach((f) => { if (!(f.key in vals)) vals[f.key] = ""; });
    const letterBody = renderLetter(tpl.body, vals);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.privacyRequest.update({ where: { id }, data: { letterBody, templateVersion: tpl.version, status: "DRAFT" } });
      await this.ev(tx, id, "LETTER_GENERATED", "SYSTEM", "Draf surat dibuat dari template", { metadata: { templateVersion: tpl.version } });
      return u;
    });
  }

  async updateLetter(user: AuthUser, id: string, body: string) {
    const r = await this.own(id, user.id);
    if (!isEditable(r.status as ReqStatus)) throw new BadRequestException("Surat yang sudah dikirim tidak dapat diubah.");
    if (!body.trim() || body.length > 20000) throw new BadRequestException("Isi surat tidak valid.");
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.privacyRequest.update({ where: { id }, data: { letterBody: body, status: "DRAFT" } });
      await this.ev(tx, id, "LETTER_EDITED", "USER", "Surat disunting pengguna");
      return u;
    });
  }

  async review(user: AuthUser, id: string) {
    const r = await this.own(id, user.id); this.guard(r.status, "REVIEWED");
    if (!r.letterBody.trim()) throw new BadRequestException("Buat draf surat terlebih dahulu.");
    if (/\{\{|\}\}/.test(r.letterBody)) throw new BadRequestException("Surat masih memuat placeholder yang belum terisi.");
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.privacyRequest.update({ where: { id }, data: { status: "REVIEWED" } });
      await this.ev(tx, id, "LETTER_REVIEWED", "USER", "Pengguna meninjau dan menyetujui isi surat");
      return u;
    });
  }

  /** Mencatat pengiriman: status, deadline, pengingat, dan timeline ditulis dalam SATU transaksi. */
  async recordSent(user: AuthUser, id: string, a: { sentVia: string; sentAt?: Date; receivedAt?: Date; followUpDays?: number }) {
    const r = await this.own(id, user.id); this.guard(r.status, "SENT");
    const now = new Date(); const sentAt = a.sentAt ?? now;
    if (sentAt.getTime() > now.getTime() + 5 * 60_000) throw new BadRequestException("Waktu pengiriman tidak boleh di masa depan.");
    if (sentAt < MIN_SENT) throw new BadRequestException("Waktu pengiriman tidak masuk akal.");
    if (a.receivedAt && a.receivedAt < sentAt) throw new BadRequestException("Waktu diterima tidak boleh sebelum waktu dikirim.");
    const follow = a.followUpDays ?? 14; if (follow < 1 || follow > 90) throw new BadRequestException("Pengingat tindak lanjut: 1 sampai 90 hari.");
    if (!["EMAIL", "FORM", "POST", "OTHER"].includes(a.sentVia)) throw new BadRequestException("Metode pengiriman tidak valid.");
    return this.prisma.$transaction(async (tx) => {
      await tx.privacyRequest.update({ where: { id }, data: { status: "SENT", sentAt, sentVia: a.sentVia, receivedAt: a.receivedAt, followUpDays: follow } });
      await this.ev(tx, id, "REQUEST_SENT", "USER", `Permintaan dikirim via ${a.sentVia}`, { metadata: { sentVia: a.sentVia }, verification: "SYSTEM_RECORDED", occurredAt: sentAt });
      await this.applyDeadline(tx, id, r.rightCode, sentAt, a.receivedAt ?? null, follow);
      await tx.notification.create({ data: { userId: user.id, requestId: id, type: "REQUEST_RECORDED", title: "Permintaan berhasil dicatat", body: "Pengiriman dicatat dan jadwal pemantauan dibuat. Unggah bukti pengiriman agar dossier lengkap.", dedupeKey: `sent:${id}` } });
      await this.audit.log(user.id, "REQUEST_SENT", "PrivacyRequest", id, undefined, tx);
    }).then(() => this.detail(user, id));
  }

  private async applyDeadline(tx: Tx, requestId: string, rightCode: string, sentAt: Date, receivedAt: Date | null, followUpDays: number) {
    const startedAt = receivedAt ?? sentAt;
    const rules = (await tx.legalRule.findMany({ where: { rightCode } })) as unknown as (RuleLike & { legalBasis: string })[];
    const rule = selectRule(rules, rightCode, startedAt);
    let dueAt: Date | null = null;
    await tx.deadline.deleteMany({ where: { requestId } });
    await tx.scheduledReminder.deleteMany({ where: { requestId, firedAt: null } });
    if (rule) {
      dueAt = computeDueAt(rule, startedAt);
      const base = receivedAt ? "waktu diterima yang Anda catat" : "waktu pengiriman (perkiraan waktu diterima)";
      const basisNote = dueAt ? `${rule.legalBasis}: ${rule.durationHours} jam kalender sejak ${base}.` : `${rule.legalBasis}: tidak ada tenggat angka yang terverifikasi untuk hak ini. Hitung mundur hukum tidak ditampilkan.`;
      await tx.deadline.create({ data: { requestId, ruleId: rule.id, startedAt, dueAt, timezone: TZ, basisNote } });
      await this.ev(tx, requestId, "DEADLINE_CALCULATED", "SYSTEM", dueAt ? `Estimasi tenggat dihitung: ${fmtDateTime(dueAt)}` : "Aturan tenggat belum terverifikasi; tidak ada hitung mundur hukum", { metadata: { ruleKey: rule.ruleKey, ruleVersion: rule.version, ruleStatus: rule.status } });
    }
    for (const p of planReminders(sentAt, dueAt, followUpDays)) {
      await tx.scheduledReminder.upsert({ where: { requestId_kind: { requestId, kind: p.kind } }, create: { requestId, kind: p.kind, fireAt: p.fireAt }, update: { fireAt: p.fireAt, queuedAt: null, firedAt: null } });
    }
  }

  async setReceivedAt(user: AuthUser, id: string, receivedAt: Date) {
    const r = await this.own(id, user.id);
    if (!["SENT", "RESPONDED"].includes(r.status) || !r.sentAt) throw new BadRequestException("Hanya untuk permintaan yang sudah dikirim.");
    if (receivedAt < r.sentAt || receivedAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException("Waktu diterima tidak valid.");
    await this.prisma.$transaction(async (tx) => {
      await tx.privacyRequest.update({ where: { id }, data: { receivedAt } });
      await this.applyDeadline(tx, id, r.rightCode, r.sentAt!, receivedAt, r.followUpDays);
      await this.ev(tx, id, "RECEIPT_RECORDED", "USER", `Waktu diterima perusahaan dicatat: ${fmtDateTime(receivedAt)}`, { verification: "USER_UPLOADED", occurredAt: receivedAt });
    });
    return this.detail(user, id);
  }

  async addResponse(user: AuthUser, id: string, a: { category: string; note?: string; receivedAt?: Date; evidenceId?: string }) {
    const r = await this.own(id, user.id);
    if (!["SENT", "RESPONDED"].includes(r.status)) throw new BadRequestException("Respons hanya dapat dicatat setelah permintaan dikirim.");
    if (a.evidenceId && !(await this.prisma.evidence.findFirst({ where: { id: a.evidenceId, requestId: id } }))) throw new BadRequestException("Bukti tidak ditemukan pada permintaan ini.");
    const receivedAt = a.receivedAt ?? new Date();
    if (r.sentAt && receivedAt < r.sentAt) throw new BadRequestException("Respons tidak boleh lebih awal dari pengiriman.");
    await this.prisma.$transaction(async (tx) => {
      await tx.companyResponse.create({ data: { requestId: id, category: a.category as never, note: a.note?.slice(0, 2000), receivedAt, evidenceId: a.evidenceId } });
      await tx.privacyRequest.update({ where: { id }, data: { status: "RESPONDED" } });
      await this.ev(tx, id, "COMPANY_RESPONDED", "USER", `Respons perusahaan dicatat: ${a.category}`, { metadata: { category: a.category, note: a.note ?? null }, verification: "USER_UPLOADED", evidenceId: a.evidenceId, occurredAt: receivedAt });
    });
    return this.detail(user, id);
  }

  async addNote(user: AuthUser, id: string, text: string) {
    await this.own(id, user.id);
    if (!text.trim() || text.length > 2000) throw new BadRequestException("Catatan tidak valid.");
    await this.ev(this.prisma, id, "USER_FOLLOWED_UP", "USER", text.trim(), { verification: "USER_UPLOADED" });
    return this.detail(user, id);
  }

  async finish(user: AuthUser, id: string, to: "COMPLETED" | "CLOSED") {
    const r = await this.own(id, user.id); this.guard(r.status, to);
    await this.prisma.$transaction(async (tx) => {
      await tx.privacyRequest.update({ where: { id }, data: { status: to } });
      if (to === "COMPLETED") await tx.deadline.updateMany({ where: { requestId: id }, data: { completedAt: new Date() } });
      await tx.scheduledReminder.deleteMany({ where: { requestId: id, firedAt: null } });
      await this.ev(tx, id, to === "COMPLETED" ? "REQUEST_COMPLETED" : "REQUEST_CLOSED", "USER", to === "COMPLETED" ? "Pengguna menandai permintaan selesai (penilaian pengguna, bukan putusan hukum)" : "Permintaan ditutup");
    });
    return this.detail(user, id);
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.privacyRequest.findMany({ where: { userId: user.id, deletedAt: null }, include: { company: true, deadline: { include: { rule: true } } }, orderBy: { updatedAt: "desc" } });
    const now = new Date();
    return rows.map((r) => ({ id: r.id, title: r.title, status: r.status, rightCode: r.rightCode, companyName: r.company.name, companySlug: r.company.slug, sentAt: r.sentAt ?? undefined,
      dueAt: r.deadline?.dueAt ?? undefined, updatedAt: r.updatedAt,
      deadlineStatus: r.deadline && r.status !== "CLOSED" ? deadlineStatus({ dueAt: r.deadline.dueAt, completedAt: r.deadline.completedAt, ruleStatus: r.deadline.rule.status }, now) : undefined }));
  }

  async detail(user: AuthUser, id: string) {
    await this.own(id, user.id);
    const r = await this.prisma.privacyRequest.findUniqueOrThrow({ where: { id }, include });
    const right = await this.prisma.dataRight.findUniqueOrThrow({ where: { code: r.rightCode } });
    const d = r.deadline;
    return { ...r, channel: r.channel ?? undefined, sentAt: r.sentAt ?? undefined, sentVia: r.sentVia ?? undefined, receivedAt: r.receivedAt ?? undefined,
      right: { ...right, fields: (rightByCode(right.code)?.fields ?? []).map((f) => ({ ...f, multiline: !!f.multiline })) },
      timeline: r.events, evidence: r.evidence, responses: r.responses,
      deadline: d ? { ruleKey: d.rule.ruleKey, ruleVersion: d.rule.version, legalBasis: d.rule.legalBasis, ruleStatus: d.rule.status, startedAt: d.startedAt, dueAt: d.dueAt ?? undefined,
        status: deadlineStatus({ dueAt: d.dueAt, completedAt: d.completedAt, ruleStatus: d.rule.status }, new Date()), timezone: d.timezone, basisNote: d.basisNote,
        disclaimer: DEADLINE_DISCLAIMER, exceptions: d.rule.exceptions ?? undefined } : undefined };
  }

  /** Surat tindak lanjut netral: tidak menuduh, hanya merujuk kronologi. Pengguna meninjau sebelum mengirim. */
  async followUpLetter(user: AuthUser, id: string) {
    const r = await this.own(id, user.id);
    if (!r.sentAt) throw new BadRequestException("Permintaan belum dikirim.");
    const c = await this.prisma.company.findUniqueOrThrow({ where: { id: r.companyId } });
    const f = r.fields as Record<string, string>;
    return `Kepada Yth.\nPejabat/Petugas Pelindungan Data Pribadi\n${c.legalName ?? c.name}\n\nPerihal: Tindak lanjut permohonan ${rightByCode(r.rightCode)?.title ?? ""}\n\nDengan hormat,\n\nSaya ${f.fullName ?? ""} (pengenal akun: ${f.accountIdentifier ?? ""}) menyampaikan permohonan pada ${fmtDateTime(r.sentAt)} melalui ${r.sentVia}. Hingga saat ini saya belum menerima tanggapan yang saya anggap lengkap.\n\nMohon informasi mengenai status permohonan tersebut dan langkah yang akan atau telah dilakukan. Apabila diperlukan informasi tambahan dari saya, mohon sampaikan dengan cara yang meminimalkan data yang diminta.\n\nTerima kasih atas perhatian Saudara.\n\nHormat saya,\n${f.fullName ?? ""}\n\n[Silakan periksa dan sunting surat ini sebelum dikirim.]`;
  }

  async exportDossier(user: AuthUser, id: string) {
    const r = await this.detail(user, id);
    const lines = [`# Dossier: ${r.title}`, `Status: ${r.status}`, `Diekspor: ${fmtDateTime(new Date())}`, "",
      "> Catatan: isi dossier ini dicatat oleh pengguna dan sistem. Bukti unggahan pengguna belum diverifikasi independen.", ""];
    if (r.deadline) lines.push(`## Tenggat\n- Status: ${r.deadline.status}\n- ${r.deadline.basisNote}\n- Estimasi tenggat: ${r.deadline.dueAt ? fmtDateTime(r.deadline.dueAt) : "tidak ada"}\n- Aturan: ${r.deadline.ruleKey} v${r.deadline.ruleVersion}\n- ${r.deadline.disclaimer}\n`);
    lines.push("## Kronologi");
    for (const e of r.timeline) lines.push(`- ${fmtDateTime(e.occurredAt)} [${e.verification}] ${e.description}`);
    lines.push("", "## Lampiran");
    for (const e of r.evidence) lines.push(`- ${e.originalName} (${e.mime}, ${e.size} byte, SHA-256 ${e.sha256}) [${e.source}]`);
    lines.push("", "## Isi surat", "```", r.letterBody, "```");
    return lines.join("\n");
  }

  async exportMyData(user: AuthUser) {
    const [u, requests, notifications] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, name: true, createdAt: true } }),
      this.prisma.privacyRequest.findMany({ where: { userId: user.id, deletedAt: null }, include: { events: true, responses: true, evidence: { select: { id: true, originalName: true, mime: true, size: true, sha256: true } }, deadline: true } }),
      this.prisma.notification.findMany({ where: { userId: user.id } })]);
    return { account: u, requests, notifications };
  }
}
