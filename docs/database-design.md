<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# Database (PostgreSQL via Prisma)
Skema: [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma), migrasi di `prisma/migrations`.
Entitas: User(role) · Company · PrivacyChannel(unik companyId+type+value) · ChannelSubmission · DataRight · LegalRule (ruleKey+version unik, effectiveFrom/supersededAt) · RequestTemplate · PrivacyRequest(status, fields JSON, letterBody) · Deadline (1:1, menyimpan ruleId = versi yang dipakai) · TimelineEvent · Evidence(sha256) · CompanyResponse · ScheduledReminder (unik requestId+kind) · Notification (dedupeKey unik) · OutboxEvent · AuditLog.
Tidak dibuat: CompanyAlias, ChannelVerification, AggregateReport (dihitung saat query), ModerationReport, Role (enum).
JSON hanya untuk isian formulir yang bervariasi per hak dan metadata event. Indeks pada (userId,status), (companyId,rightCode), (requestId,occurredAt), (fireAt,firedAt). FK mencegah penghapusan aturan yang sudah dipakai permintaan (teruji).
Retensi: soft delete akun = anonimisasi + kosongkan isi surat + hapus notifikasi dan berkas bukti. Audit log tidak dihapus. **Belum ada kebijakan retensi otomatis atau enkripsi kolom.**
