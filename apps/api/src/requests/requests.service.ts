// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AuditService } from "../common/audit";
import { AuthUser } from "../common/auth";
import { computeDueAt, deadlineStatus, planReminders, RuleLike, selectRule } from "../domain/deadline.engine";
import { approachingHours, approachingMs, timeScale } from "../deadlines/deadline.clock";
import { assertTransition, isEditable, ReqStatus } from "../domain/request.state";
import { Mailer, MailReceipt } from "../common/mailer";
import { LettersService } from "../letters/letters.module";
import { LETTER_DISCLAIMER } from "../domain/legal-refs";
import { rightByCode } from "../domain/rights.catalog";

export const DEADLINE_DISCLAIMER =
  "Penghitungan ini merupakan estimasi berdasarkan aturan yang tercatat. Silakan periksa ketentuan yang berlaku dan kondisi permintaan Anda.";
const TZ = "Asia/Jakarta";
const MIN_SENT = new Date("2022-10-17T00:00:00Z"); // UU 27/2022 diundangkan
const fmtDateTime = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: TZ }).format(d) + " WIB";
type Tx = Prisma.TransactionClient;
type SentInput = {
  sentVia: string;
  sentAt?: Date;
  receivedAt?: Date;
  followUpDays?: number;
  delivery?: { to: string; subject: string; receipt: MailReceipt };
};

const include = {
  company: { include: { channels: true } },
  channel: true,
  deadline: { include: { rule: true } },
  events: { orderBy: { occurredAt: "asc" as const } },
  evidence: { orderBy: { createdAt: "asc" as const } },
  responses: { orderBy: { receivedAt: "asc" as const } },
};

@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private letters: LettersService,
    private mailer: Mailer,
  ) {}

  private async own(id: string, userId: string, tx: Tx | PrismaService = this.prisma) {
    const r = await tx.privacyRequest.findFirst({ where: { id, userId, deletedAt: null } });
    if (!r) throw new NotFoundException("Permintaan tidak ditemukan."); // 404, bukan 403, agar keberadaan ID tidak bocor
    return r;
  }
  private ev(
    tx: Tx,
    requestId: string,
    type: string,
    actor: "SYSTEM" | AuthUser,
    description: string,
    o: {
      metadata?: Prisma.InputJsonValue;
      verification?: "USER_UPLOADED" | "SYSTEM_RECORDED";
      evidenceId?: string;
      occurredAt?: Date;
    } = {},
  ) {
    return tx.timelineEvent.create({
      data: {
        requestId,
        type,
        actor: actor === "SYSTEM" ? "SYSTEM" : "USER",
        actorId: actor === "SYSTEM" ? null : actor.id, // siapa; kapan = occurredAt; apa = type + description
        description,
        metadata: o.metadata,
        verification: o.verification ?? "SYSTEM_RECORDED",
        evidenceId: o.evidenceId,
        occurredAt: o.occurredAt,
      },
    });
  }
  /**
   * Tulis perubahan HANYA bila status masih sama dengan yang dibaca (compare-and-set). Dua aksi paralel (klik ganda, balasan simulasi
   * vs tutup) tidak bisa saling menimpa: yang kalah mendapat galat jelas, bukan menimpa diam-diam.
   */
  private async move(tx: Tx, r: { id: string; status: string }, data: Prisma.PrivacyRequestUpdateManyMutationInput) {
    const n = await tx.privacyRequest.updateMany({
      where: { id: r.id, status: r.status as ReqStatus, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    if (!n.count) throw new BadRequestException("Status permintaan baru saja berubah. Muat ulang halaman lalu coba lagi.");
  }
  private guard(from: string, to: string) {
    try {
      assertTransition(from as ReqStatus, to as ReqStatus);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  async create(user: AuthUser, companyId: string, rightCode: string, channelId?: string) {
    const [company, right] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.dataRight.findUnique({ where: { code: rightCode } }),
    ]);
    if (!company || !right) throw new NotFoundException("Perusahaan atau jenis hak tidak ditemukan.");
    if (channelId && !(await this.prisma.privacyChannel.findFirst({ where: { id: channelId, companyId } })))
      throw new BadRequestException("Kanal tidak sesuai dengan perusahaan.");
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.privacyRequest.create({
        data: { userId: user.id, companyId, rightCode, channelId, title: `${right.title} — ${company.name}`, fields: {} },
      });
      await this.ev(tx, r.id, "REQUEST_CREATED", user, "Permintaan dibuat", { metadata: { company: company.name, right: rightCode } });
      return r;
    });
  }

  async updateFields(user: AuthUser, id: string, fields: Record<string, unknown>, channelId?: string | null) {
    const r = await this.own(id, user.id);
    if (!isEditable(r.status as ReqStatus)) throw new BadRequestException("Permintaan yang sudah dikirim tidak dapat diubah.");
    const def = rightByCode(r.rightCode)!;
    const allowed = new Set(def.fields.map((f) => f.key));
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields ?? {})) {
      if (!allowed.has(k)) continue;
      clean[k] = String(v ?? "").slice(0, 2000);
    } // anti mass-assignment: hanya kolom yang dikenal
    if (channelId && !(await this.prisma.privacyChannel.findFirst({ where: { id: channelId, companyId: r.companyId } })))
      throw new BadRequestException("Kanal tidak sesuai dengan perusahaan.");
    // mengubah isian menggugurkan peninjauan sebelumnya
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, r, { fields: clean, status: "DRAFT" });
      if (channelId !== undefined) await tx.privacyRequest.update({ where: { id }, data: { channelId } });
      await this.ev(tx, id, "FIELDS_UPDATED", user, "Isian permintaan diubah", {
        metadata: { keys: Object.keys(clean), ...(r.status !== "DRAFT" && { from: r.status, to: "DRAFT" }) },
      });
    });
  }

  async generateLetter(user: AuthUser, id: string) {
    const r = await this.own(id, user.id);
    if (!isEditable(r.status as ReqStatus)) throw new BadRequestException("Surat tidak dapat dibuat ulang setelah dikirim.");
    const { body, templateVersion } = await this.letters.compose(r.rightCode, r.companyId, r.fields as Record<string, string>);
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, r, { letterBody: body, templateVersion, status: "DRAFT" });
      await this.ev(tx, id, "LETTER_GENERATED", "SYSTEM", "Draf surat dibuat dari template", {
        metadata: { templateVersion, ...(r.status !== "DRAFT" && { from: r.status, to: "DRAFT" }) },
      });
    });
  }

  async updateLetter(user: AuthUser, id: string, body: string) {
    const r = await this.own(id, user.id);
    if (!isEditable(r.status as ReqStatus)) throw new BadRequestException("Surat yang sudah dikirim tidak dapat diubah.");
    if (!body.trim() || body.length > 20000) throw new BadRequestException("Isi surat tidak valid.");
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, r, { letterBody: body, status: "DRAFT" });
      await this.ev(tx, id, "LETTER_EDITED", user, "Surat disunting pengguna", {
        metadata: r.status !== "DRAFT" ? { from: r.status, to: "DRAFT" } : undefined,
      });
    });
  }

  async review(user: AuthUser, id: string) {
    const r = await this.own(id, user.id);
    this.guard(r.status, "REVIEWED");
    if (!r.letterBody.trim()) throw new BadRequestException("Buat draf surat terlebih dahulu.");
    if (/\{\{|\}\}/.test(r.letterBody)) throw new BadRequestException("Surat masih memuat placeholder yang belum terisi.");
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, r, { status: "REVIEWED" });
      await this.ev(tx, id, "LETTER_REVIEWED", user, "Pengguna meninjau dan menyetujui isi surat", {
        metadata: { from: r.status, to: "REVIEWED" },
      });
    });
  }

  /** Mencatat pengiriman manual: status, deadline, pengingat, dan timeline ditulis dalam SATU transaksi. */
  async recordSent(user: AuthUser, id: string, a: SentInput) {
    const r = await this.own(id, user.id);
    await this.prisma.$transaction((tx) => this.writeSent(tx, user, r, a));
    return this.detail(user, id);
  }

  /**
   * Kirim surat lewat email ke kanal privasi perusahaan, lalu catat pengiriman (bukti kirim + tenggat) dalam transaksi yang sama.
   * Baris permintaan dikunci SEBELUM email dikirim: klik ganda/tab kedua menunggu, lalu melihat status SENT dan ditolak,
   * sehingga surat tidak pernah terkirim dua kali.
   */
  async sendByEmail(user: AuthUser, id: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "PrivacyRequest" WHERE id = ${id} AND "userId" = ${user.id} FOR UPDATE`;
        const r = await this.own(id, user.id, tx);
        this.guard(r.status, "SENT");
        const ch = await tx.privacyChannel.findFirst({
          where: r.channelId ? { id: r.channelId, companyId: r.companyId } : { companyId: r.companyId, type: "PRIVACY_EMAIL" },
          orderBy: { status: "desc" }, // OFFICIAL > COMMUNITY_VERIFIED > UNVERIFIED (urutan enum)
        });
        if (!ch || !["PRIVACY_EMAIL", "DPO_EMAIL"].includes(ch.type))
          throw new BadRequestException("Kanal email privasi tidak tersedia. Pilih kanal email, atau catat pengiriman manual.");
        const receipt = await this.mailer.send(ch.value, r.title, r.letterBody, { replyTo: user.email }).catch(() => {
          throw new BadRequestException("Email gagal dikirim. Status permintaan tidak berubah; coba lagi.");
        });
        // shortcut: bila commit gagal SETELAH SMTP menerima email, email terkirim tanpa catatan (jendela satu commit); outbox email bila perlu menutupnya
        await this.writeSent(tx, user, r, {
          sentVia: "EMAIL",
          sentAt: receipt.sentAt,
          delivery: { to: ch.value, subject: r.title, receipt },
        });
      },
      { timeout: 20_000, maxWait: 10_000 }, // SMTP timeout 8 dtk
    );
    return this.detail(user, id);
  }

  private async writeSent(tx: Tx, user: AuthUser, r: { id: string; status: string; rightCode: string }, a: SentInput) {
    const id = r.id;
    this.guard(r.status, "SENT");
    const now = new Date();
    const sentAt = a.sentAt ?? now;
    if (sentAt.getTime() > now.getTime() + 5 * 60_000) throw new BadRequestException("Waktu pengiriman tidak boleh di masa depan.");
    if (sentAt < MIN_SENT) throw new BadRequestException("Waktu pengiriman tidak masuk akal.");
    if (a.receivedAt && a.receivedAt < sentAt) throw new BadRequestException("Waktu diterima tidak boleh sebelum waktu dikirim.");
    const follow = a.followUpDays ?? 14;
    if (follow < 1 || follow > 90) throw new BadRequestException("Pengingat tindak lanjut: 1 sampai 90 hari.");
    if (!["EMAIL", "FORM", "POST", "OTHER"].includes(a.sentVia)) throw new BadRequestException("Metode pengiriman tidak valid.");
    await this.move(tx, r, { status: "SENT", sentAt, sentVia: a.sentVia, receivedAt: a.receivedAt, followUpDays: follow });
    await this.ev(tx, id, "REQUEST_SENT", user, `Permintaan dikirim via ${a.sentVia}`, {
      metadata: { sentVia: a.sentVia, from: r.status, to: "SENT" },
      verification: "SYSTEM_RECORDED",
      occurredAt: sentAt,
    });
    if (a.delivery) {
      const { to, subject, receipt } = a.delivery;
      await tx.emailDelivery.create({
        data: {
          requestId: id,
          kind: "REQUEST",
          toAddress: to,
          subject,
          messageId: receipt.messageId,
          contentSha256: receipt.contentSha256,
          sentAt: receipt.sentAt,
        },
      });
      await this.ev(tx, id, "EMAIL_DELIVERED", "SYSTEM", `Email diserahkan ke server SMTP untuk ${to}`, {
        metadata: { messageId: receipt.messageId, contentSha256: receipt.contentSha256, to },
        occurredAt: receipt.sentAt,
      });
    }
    await this.applyDeadline(tx, id, r.rightCode, sentAt, a.receivedAt ?? null, follow);
    await tx.notification.create({
      data: {
        userId: user.id,
        requestId: id,
        type: "REQUEST_RECORDED",
        title: "Permintaan berhasil dicatat",
        body: "Pengiriman dicatat dan jadwal pemantauan dibuat. Unggah bukti pengiriman agar dossier lengkap.",
        dedupeKey: `sent:${id}`,
      },
    });
    await this.audit.log(user.id, "REQUEST_SENT", "PrivacyRequest", id, undefined, tx);
  }

  /** Eskalasi adalah keputusan pengguna dan hanya dari OVERDUE (aturan VERIFIED yang tenggatnya lewat). */
  async escalate(user: AuthUser, id: string, note?: string) {
    const r = await this.own(id, user.id);
    this.guard(r.status, "ESCALATED");
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, r, { status: "ESCALATED", escalatedAt: now });
      await tx.reminder.deleteMany({ where: { requestId: id, firedAt: null } });
      await this.ev(tx, id, "REQUEST_ESCALATED", user, "Pengguna mengeskalasi permintaan; dossier siap diekspor", {
        metadata: { from: r.status, to: "ESCALATED", note: note?.slice(0, 2000) ?? null },
      });
      await this.audit.log(user.id, "REQUEST_ESCALATED", "PrivacyRequest", id, undefined, tx);
    });
    return this.detail(user, id);
  }

  private async applyDeadline(tx: Tx, requestId: string, rightCode: string, sentAt: Date, receivedAt: Date | null, followUpDays: number) {
    const startedAt = receivedAt ?? sentAt;
    const scale = timeScale(); // hanya untuk demo; 1 di produksi (dijaga validateEnv)
    const rules = (await tx.legalRule.findMany({ where: { rightCode } })) as unknown as (RuleLike & { legalBasis: string })[];
    const rule = selectRule(rules, rightCode, startedAt);
    let dueAt: Date | null = null;
    await tx.deadline.deleteMany({ where: { requestId } });
    await tx.reminder.deleteMany({ where: { requestId, firedAt: null } });
    if (rule) {
      dueAt = computeDueAt(rule, startedAt, scale);
      const base = receivedAt ? "waktu diterima yang Anda catat" : "waktu pengiriman (perkiraan waktu diterima)";
      const basisNote = dueAt
        ? `${rule.legalBasis}: ${rule.durationHours} jam kalender sejak ${base}.`
        : `${rule.legalBasis}: tidak ada tenggat angka yang terverifikasi untuk hak ini. Hitung mundur hukum tidak ditampilkan.`;
      await tx.deadline.create({ data: { requestId, ruleId: rule.id, startedAt, dueAt, timezone: TZ, basisNote, timeScale: scale } });
      await this.ev(
        tx,
        requestId,
        "DEADLINE_CALCULATED",
        "SYSTEM",
        dueAt ? `Estimasi tenggat dihitung: ${fmtDateTime(dueAt)}` : "Aturan tenggat belum terverifikasi; tidak ada hitung mundur hukum",
        { metadata: { ruleKey: rule.ruleKey, ruleVersion: rule.version, ruleStatus: rule.status } },
      );
    }
    for (const p of planReminders(sentAt, dueAt, followUpDays, { scale, approachingHours: approachingHours() })) {
      const rem = await tx.reminder.upsert({
        where: { requestId_kind: { requestId, kind: p.kind } },
        create: { requestId, kind: p.kind, fireAt: p.fireAt },
        update: { fireAt: p.fireAt, queuedAt: null, firedAt: null },
      });
      // outbox di transaksi yang sama: pengingat tercatat <=> pesan pasti akan terbit (ReminderService.publishOutbox)
      await tx.outboxEvent.create({ data: { type: "reminder.schedule", payload: { reminderId: rem.id, kind: rem.kind, attempt: 0 } } });
    }
  }

  async setReceivedAt(user: AuthUser, id: string, receivedAt: Date) {
    const r = await this.own(id, user.id);
    if (!["SENT", "RESPONDED"].includes(r.status) || !r.sentAt) throw new BadRequestException("Hanya untuk permintaan yang sudah dikirim.");
    if (receivedAt < r.sentAt || receivedAt.getTime() > Date.now() + 5 * 60_000)
      throw new BadRequestException("Waktu diterima tidak valid.");
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, r, { receivedAt }); // status harus tetap SENT/RESPONDED saat ditulis
      await this.applyDeadline(tx, id, r.rightCode, r.sentAt!, receivedAt, r.followUpDays);
      await this.ev(tx, id, "RECEIPT_RECORDED", user, `Waktu diterima perusahaan dicatat: ${fmtDateTime(receivedAt)}`, {
        verification: "USER_UPLOADED",
        occurredAt: receivedAt,
      });
    });
    return this.detail(user, id);
  }

  async addResponse(user: AuthUser, id: string, a: { category: string; note?: string; receivedAt?: Date; evidenceId?: string }) {
    const r = await this.own(id, user.id);
    await this.prisma.$transaction((tx) => this.applyResponse(tx, r, a, user));
    return this.detail(user, id);
  }

  /** Balasan perusahaan simulasi (mode demo): aktor SYSTEM, ditandai `simulated`. Dipanggil oleh SimulationService. */
  async addSimulatedResponse(id: string, a: { category: string; note: string; receivedAt: Date }) {
    const r = await this.prisma.privacyRequest.findFirstOrThrow({ where: { id, deletedAt: null } });
    await this.prisma.$transaction((tx) => this.applyResponse(tx, r, a, "SYSTEM"));
  }

  private async applyResponse(
    tx: Tx,
    r: { id: string; status: string; sentAt: Date | null },
    a: { category: string; note?: string; receivedAt?: Date; evidenceId?: string },
    actor: AuthUser | "SYSTEM",
  ) {
    if (!["SENT", "OVERDUE", "ESCALATED", "RESPONDED"].includes(r.status))
      throw new BadRequestException("Respons hanya dapat dicatat setelah permintaan dikirim.");
    if (a.evidenceId && !(await tx.evidence.findFirst({ where: { id: a.evidenceId, requestId: r.id } })))
      throw new BadRequestException("Bukti tidak ditemukan pada permintaan ini.");
    const receivedAt = a.receivedAt ?? new Date();
    if (r.sentAt && receivedAt < r.sentAt) throw new BadRequestException("Respons tidak boleh lebih awal dari pengiriman.");
    const simulated = actor === "SYSTEM";
    await tx.companyResponse.create({
      data: {
        requestId: r.id,
        category: a.category as never,
        note: a.note?.slice(0, 2000),
        receivedAt,
        evidenceId: a.evidenceId,
        simulated,
      },
    });
    await this.move(tx, r, { status: "RESPONDED" }); // gagal bila pengguna menutup permintaan di saat yang sama
    await this.ev(tx, r.id, "COMPANY_RESPONDED", actor, `${simulated ? "[SIMULASI] " : ""}Respons perusahaan dicatat: ${a.category}`, {
      metadata: { category: a.category, note: a.note ?? null, from: r.status, to: "RESPONDED", simulated },
      verification: simulated ? "SYSTEM_RECORDED" : "USER_UPLOADED",
      evidenceId: a.evidenceId,
      occurredAt: receivedAt,
    });
  }

  async addNote(user: AuthUser, id: string, text: string) {
    await this.own(id, user.id);
    if (!text.trim() || text.length > 2000) throw new BadRequestException("Catatan tidak valid.");
    await this.ev(this.prisma, id, "USER_FOLLOWED_UP", user, text.trim(), { verification: "USER_UPLOADED" });
    return this.detail(user, id);
  }

  async finish(user: AuthUser, id: string, to: "COMPLETED" | "CLOSED") {
    const r = await this.own(id, user.id);
    this.guard(r.status, to);
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, r, { status: to });
      if (to === "COMPLETED") await tx.deadline.updateMany({ where: { requestId: id }, data: { completedAt: new Date() } });
      await tx.reminder.deleteMany({ where: { requestId: id, firedAt: null } });
      await this.ev(
        tx,
        id,
        to === "COMPLETED" ? "REQUEST_COMPLETED" : "REQUEST_CLOSED",
        user,
        to === "COMPLETED" ? "Pengguna menandai permintaan selesai (penilaian pengguna, bukan putusan hukum)" : "Permintaan ditutup",
        { metadata: { from: r.status, to } },
      );
    });
    return this.detail(user, id);
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.privacyRequest.findMany({
      where: { userId: user.id, deletedAt: null },
      include: { company: true, deadline: { include: { rule: true } } },
      orderBy: { updatedAt: "desc" },
    });
    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      rightCode: r.rightCode,
      companyName: r.company.name,
      companySlug: r.company.slug,
      sentAt: r.sentAt ?? undefined,
      dueAt: r.deadline?.dueAt ?? undefined,
      updatedAt: r.updatedAt,
      deadlineStatus:
        r.deadline && r.status !== "CLOSED"
          ? deadlineStatus(
              { dueAt: r.deadline.dueAt, completedAt: r.deadline.completedAt, ruleStatus: r.deadline.rule.status },
              now,
              approachingMs(r.deadline.timeScale),
            )
          : undefined,
    }));
  }

  async detail(user: AuthUser, id: string) {
    await this.own(id, user.id);
    const r = await this.prisma.privacyRequest.findUniqueOrThrow({ where: { id }, include });
    const right = await this.prisma.dataRight.findUniqueOrThrow({ where: { code: r.rightCode } });
    const d = r.deadline;
    return {
      ...r,
      channel: r.channel ?? undefined,
      sentAt: r.sentAt ?? undefined,
      sentVia: r.sentVia ?? undefined,
      receivedAt: r.receivedAt ?? undefined,
      right: { ...right, fields: (rightByCode(right.code)?.fields ?? []).map((f) => ({ ...f, multiline: !!f.multiline })) },
      letterDisclaimer: LETTER_DISCLAIMER,
      timeline: r.events,
      evidence: r.evidence,
      responses: r.responses,
      deadline: d
        ? {
            ruleKey: d.rule.ruleKey,
            ruleVersion: d.rule.version,
            legalBasis: d.rule.legalBasis,
            ruleStatus: d.rule.status,
            startedAt: d.startedAt,
            dueAt: d.dueAt ?? undefined,
            status: deadlineStatus(
              { dueAt: d.dueAt, completedAt: d.completedAt, ruleStatus: d.rule.status },
              new Date(),
              approachingMs(d.timeScale),
            ),
            timezone: d.timezone,
            basisNote: d.basisNote,
            disclaimer: DEADLINE_DISCLAIMER,
            exceptions: d.rule.exceptions ?? undefined,
          }
        : undefined,
    };
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
    const lines = [
      `# Dossier: ${r.title}`,
      `Status: ${r.status}`,
      `Diekspor: ${fmtDateTime(new Date())}`,
      "",
      "> Catatan: isi dossier ini dicatat oleh pengguna dan sistem. Bukti unggahan pengguna belum diverifikasi independen.",
      "",
    ];
    if (r.deadline)
      lines.push(
        `## Tenggat\n- Status: ${r.deadline.status}\n- ${r.deadline.basisNote}\n- Estimasi tenggat: ${r.deadline.dueAt ? fmtDateTime(r.deadline.dueAt) : "tidak ada"}\n- Aturan: ${r.deadline.ruleKey} v${r.deadline.ruleVersion}\n- ${r.deadline.disclaimer}\n`,
      );
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
      this.prisma.privacyRequest.findMany({
        where: { userId: user.id, deletedAt: null },
        include: {
          events: true,
          responses: true,
          evidence: { select: { id: true, originalName: true, mime: true, size: true, sha256: true } },
          deadline: true,
        },
      }),
      this.prisma.notification.findMany({ where: { userId: user.id } }),
    ]);
    return { account: u, requests, notifications };
  }
}
