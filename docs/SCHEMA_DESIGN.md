<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# SCHEMA_DESIGN: Prisma + GraphQL (target, belum di-apply)

Status: **Diusulkan (Fase 0).** Tidak ada migrasi dijalankan dan `apps/api/prisma/schema.prisma` tidak diubah. Diturunkan dari skema yang ada (319 baris, dibaca penuh) dan arsitektur di [ARCHITECTURE.md](ARCHITECTURE.md). Perubahan dari skema sekarang ditandai `// Δ`. Menggantikan [database-design.md](database-design.md).

## 1. Ringkasan perubahan

| # | Perubahan | Alasan | Terkait |
|---|---|---|---|
| 1 | `RequestStatus`: hapus `REVIEWED`, `COMPLETED`; tambah `ACKNOWLEDGED`, `OVERDUE`, `ESCALATED` | State machine brief | D-003 (butuh persetujuan), GAP #3 |
| 2 | `CloseReason`, `overdueAt`, `escalatedAt`, `closedAt`, `version` pada `PrivacyRequest` | Alasan penutupan menampung `COMPLETED`; `version` untuk optimistic lock | |
| 3 | `ScheduledReminder` menjadi `Reminder` (`@@map` ke tabel lama) + `ruleVersion`, `attempts`, `lastError` | Nama brief; telemetri retry | GAP #22 |
| 4 | `Deadline`: `basis`, `ruleVersion`, `timeScale`; index `dueAt` | Rekonsiliasi OVERDUE, label estimasi, mode demo | LEGAL_SOURCES L2, L4 |
| 5 | `OutboxEvent`: `nextAttemptAt`, `lastError`, index diperbaiki | Publisher dan rekonsiliasi | |
| 6 | `User`: `emailVerifiedAt`, `tokenVersion` | Risiko R1 (stretch), pencabutan token | threat-model S2 |
| 7 | `DossierExport` (baru) | Catatan integritas ekspor (hash isi) | |
| 8 | `ModerationReport` (baru, **stretch**) | Takedown, risiko R4 | PRD P2 |
| 9 | CHECK constraint dan partial index (SQL manual) | Prisma tidak mendukung CHECK/partial index | bagian 3 |

## 2. Skema Prisma lengkap

```prisma
// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  USER
  MODERATOR
  ADMIN
}

enum VerificationStatus {
  VERIFIED
  COMMUNITY_REPORTED
  UNVERIFIED
  OUTDATED
}

enum ChannelType {
  PRIVACY_EMAIL
  DPO_EMAIL
  REQUEST_FORM
  POSTAL_ADDRESS
  PRIVACY_POLICY_URL
}

enum RuleStatus {
  VERIFIED
  NEEDS_CONFIRMATION
  NOT_VERIFIED
}

// Δ REVIEWED dan COMPLETED dihapus; ACKNOWLEDGED, OVERDUE, ESCALATED ditambah
enum RequestStatus {
  DRAFT
  SENT
  ACKNOWLEDGED
  RESPONDED
  OVERDUE
  ESCALATED
  CLOSED
}

// Δ baru: menampung makna COMPLETED lama
enum CloseReason {
  CANCELLED   // dibatalkan saat DRAFT
  WITHDRAWN   // ditarik pengguna setelah terkirim
  RESOLVED    // pengguna menilai selesai (bekas COMPLETED)
  UNRESOLVED  // ditutup tanpa penyelesaian
}

enum EvidenceSource {
  USER_UPLOADED
  SYSTEM_RECORDED
  VERIFIED
  DISPUTED
}

enum ResponseCategory {
  ACKNOWLEDGED
  ADDITIONAL_INFO_REQUESTED
  IN_PROGRESS
  FULFILLED
  PARTIALLY_FULFILLED
  REJECTED
  NO_RESPONSE
  OTHER
}

enum ReminderKind {
  APPROACHING
  PASSED
  FOLLOW_UP
}

// Δ baru: dasar awal hitung tenggat (LEGAL_SOURCES L2)
enum DeadlineBasis {
  SENT_ESTIMATE // dihitung dari sentAt, karena receivedAt belum diketahui
  RECEIVED      // dihitung dari receivedAt yang dicatat pengguna
}

enum SubmissionStatus {
  PENDING
  APPROVED
  REJECTED
}

model User {
  id              String              @id @default(cuid())
  email           String              @unique
  passwordHash    String // argon2id; hash bcrypt lama di-rehash saat login (D-006)
  name            String
  role            Role                @default(USER)
  emailVerifiedAt DateTime? // Δ
  tokenVersion    Int                 @default(0) // Δ naik = semua JWT lama tidak sah
  deletedAt       DateTime?
  createdAt       DateTime            @default(now())
  requests        PrivacyRequest[]
  notifications   Notification[]
  submissions     ChannelSubmission[]
  dossierExports  DossierExport[]
  reports         ModerationReport[]
}

model Company {
  id          String              @id @default(cuid())
  slug        String              @unique
  name        String
  brand       String?
  legalName   String?
  industry    String
  website     String?
  isDemo      Boolean             @default(false)
  notes       String?
  createdAt   DateTime            @default(now())
  channels    PrivacyChannel[]
  requests    PrivacyRequest[]
  submissions ChannelSubmission[]

  @@index([industry])
  @@index([name]) // Δ pencarian awalan; ganti ke pg_trgm bila perlu
}

model PrivacyChannel {
  id            String             @id @default(cuid())
  companyId     String
  company       Company            @relation(fields: [companyId], references: [id], onDelete: Cascade)
  type          ChannelType
  value         String
  status        VerificationStatus @default(UNVERIFIED)
  sourceUrl     String?
  lastCheckedAt DateTime?
  note          String?
  requests      PrivacyRequest[]

  @@unique([companyId, type, value])
  @@index([companyId, status]) // Δ
}

model ChannelSubmission {
  id         String           @id @default(cuid())
  companyId  String
  company    Company          @relation(fields: [companyId], references: [id], onDelete: Cascade)
  userId     String
  user       User             @relation(fields: [userId], references: [id])
  type       ChannelType
  value      String
  sourceUrl  String
  status     SubmissionStatus @default(PENDING)
  reviewNote String?
  createdAt  DateTime         @default(now())

  @@index([status, createdAt]) // Δ antrean moderasi terurut
  @@index([userId])            // Δ FK
}

model DataRight {
  code                    String            @id
  article                 String
  title                   String
  plainMeaning            String
  needs                   String[]
  requiresRecordedRequest Boolean           @default(true)
  sortOrder               Int
  templates               RequestTemplate[]
  rules                   LegalRule[]
}

model LegalRule {
  id             String     @id @default(cuid())
  ruleKey        String
  version        Int
  rightCode      String
  right          DataRight  @relation(fields: [rightCode], references: [code])
  legalBasis     String
  triggerEvent   String     @default("REQUEST_RECEIVED")
  durationHours  Int?       // null = tidak ada tenggat (hapus, musnah, keberatan otomatis)
  calcMethod     String     @default("CALENDAR_HOURS") // VERIFY: kalender vs hari kerja
  applicability  String?
  exceptions     String?
  sourceRef      String? // Δ kode sumber di LEGAL_SOURCES (mis. "S1 Ps.32; S3 Ps.77")
  status         RuleStatus
  verifiedBy     String?
  lastReviewedAt DateTime?
  effectiveFrom  DateTime
  supersededAt   DateTime?
  deadlines      Deadline[]

  @@unique([ruleKey, version])
  @@index([rightCode, effectiveFrom])
}

model RequestTemplate {
  id        String    @id @default(cuid())
  rightCode String
  right     DataRight @relation(fields: [rightCode], references: [code])
  version   Int
  body      String
  active    Boolean   @default(true)

  @@unique([rightCode, version])
}

model PrivacyRequest {
  id              String            @id @default(cuid())
  userId          String
  user            User              @relation(fields: [userId], references: [id])
  companyId       String
  company         Company           @relation(fields: [companyId], references: [id])
  rightCode       String
  channelId       String?
  channel         PrivacyChannel?   @relation(fields: [channelId], references: [id])
  status          RequestStatus     @default(DRAFT)
  closeReason     CloseReason? // Δ wajib bila status = CLOSED (CHECK)
  title           String
  fields          Json
  letterBody      String            @default("")
  templateVersion Int?
  sentAt          DateTime?
  sentVia         String?
  receivedAt      DateTime? // waktu terima oleh pengendali (PP Ps. 22), dari bukti
  overdueAt       DateTime? // Δ diisi saat transisi OVERDUE
  escalatedAt     DateTime? // Δ
  closedAt        DateTime? // Δ
  followUpDays    Int               @default(14)
  version         Int               @default(0) // Δ optimistic lock
  deletedAt       DateTime?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  deadline        Deadline?
  events          TimelineEvent[]
  evidence        Evidence[]
  responses       CompanyResponse[]
  reminders       Reminder[]
  dossierExports  DossierExport[]

  @@index([userId, status])
  @@index([userId, createdAt(sort: Desc)]) // Δ daftar saya + cursor
  @@index([companyId, rightCode])
  @@index([channelId])                      // Δ FK
  @@index([status, sentAt])                 // Δ statistik dan rekonsiliasi
}

model Deadline {
  id          String         @id @default(cuid())
  requestId   String         @unique
  request     PrivacyRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  ruleId      String
  rule        LegalRule      @relation(fields: [ruleId], references: [id])
  ruleVersion Int // Δ salinan, agar dossier tahan terhadap perubahan aturan
  basis       DeadlineBasis  @default(SENT_ESTIMATE) // Δ
  startedAt   DateTime
  dueAt       DateTime?
  timeScale   Int            @default(1) // Δ DEADLINE_TIME_SCALE saat dihitung (demo > 1)
  timezone    String
  basisNote   String
  completedAt DateTime?

  @@index([dueAt]) // Δ rekonsiliasi; partial index di bagian 3
  @@index([ruleId]) // Δ FK
}

model TimelineEvent {
  id           String         @id @default(cuid())
  requestId    String
  request      PrivacyRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  type         String
  actor        String // USER | SYSTEM | MODERATOR | ADMIN
  description  String
  occurredAt   DateTime       @default(now())
  metadata     Json?
  verification EvidenceSource @default(SYSTEM_RECORDED)
  evidenceId   String?

  @@index([requestId, occurredAt])
}

model Evidence {
  id           String         @id @default(cuid())
  requestId    String
  request      PrivacyRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  storageKey   String         @unique
  originalName String
  mime         String
  size         Int
  sha256       String // hex 64 (CHECK)
  source       EvidenceSource @default(USER_UPLOADED)
  createdAt    DateTime       @default(now())

  @@index([requestId]) // Δ
}

model CompanyResponse {
  id         String           @id @default(cuid())
  requestId  String
  request    PrivacyRequest   @relation(fields: [requestId], references: [id], onDelete: Cascade)
  category   ResponseCategory
  note       String?
  receivedAt DateTime
  evidenceId String?
  createdAt  DateTime         @default(now())

  @@index([requestId, receivedAt]) // Δ
}

// Δ ganti nama dari ScheduledReminder; tabel lama dipertahankan
model Reminder {
  id          String         @id @default(cuid())
  requestId   String
  request     PrivacyRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  kind        ReminderKind
  fireAt      DateTime
  ruleVersion Int? // Δ ikut membentuk dedupeKey notifikasi
  queuedAt    DateTime?
  firedAt     DateTime?
  attempts    Int            @default(0) // Δ
  lastError   String? // Δ tanpa PII

  @@unique([requestId, kind])
  @@index([fireAt, firedAt])
  @@map("ScheduledReminder")
}

model Notification {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  requestId String?
  type      String
  title     String
  body      String
  dedupeKey String    @unique // reminderId:kind:ruleVersion
  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId, readAt])
  @@index([userId, createdAt(sort: Desc)]) // Δ cursor
}

model OutboxEvent {
  id            String    @id @default(cuid())
  type          String
  payload       Json // hanya ID, tanpa PII
  createdAt     DateTime  @default(now())
  publishedAt   DateTime?
  attempts      Int       @default(0)
  nextAttemptAt DateTime? // Δ backoff publisher
  lastError     String? // Δ

  @@index([publishedAt, createdAt]) // Δ
}

model AuditLog {
  id        String   @id @default(cuid())
  actorId   String?
  action    String
  entity    String
  entityId  String?
  meta      Json?
  createdAt DateTime @default(now())

  @@index([entity, entityId])
  @@index([createdAt])        // Δ
  @@index([actorId, createdAt]) // Δ
}

// Δ baru: bukti bahwa dossier tertentu pernah diekspor dan hash isinya
model DossierExport {
  id            String         @id @default(cuid())
  requestId     String
  request       PrivacyRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  userId        String
  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  contentSha256 String
  ruleVersion   Int?
  eventCount    Int
  createdAt     DateTime       @default(now())

  @@index([requestId, createdAt])
}

// Δ baru, STRETCH: laporan konten kanal/usulan yang keliru atau merugikan (risiko R4)
model ModerationReport {
  id         String    @id @default(cuid())
  reporterId String
  reporter   User      @relation(fields: [reporterId], references: [id])
  entity     String // PrivacyChannel | Company | ChannelSubmission
  entityId   String
  reason     String
  resolvedAt DateTime?
  createdAt  DateTime  @default(now())

  @@index([resolvedAt, createdAt])
}
```

## 3. SQL manual yang menyertai migrasi (Prisma belum mendukung)

```sql
-- Konsistensi status dan stempel waktu
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT pr_sent_chk
  CHECK (status = 'DRAFT' OR "sentAt" IS NOT NULL);
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT pr_overdue_chk
  CHECK (status <> 'OVERDUE' OR "overdueAt" IS NOT NULL);
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT pr_escalated_chk
  CHECK (status <> 'ESCALATED' OR "escalatedAt" IS NOT NULL);
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT pr_closed_chk
  CHECK (status <> 'CLOSED' OR ("closedAt" IS NOT NULL AND "closeReason" IS NOT NULL));
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT pr_followup_chk
  CHECK ("followUpDays" BETWEEN 1 AND 90);
ALTER TABLE "Deadline" ADD CONSTRAINT dl_due_chk
  CHECK ("dueAt" IS NULL OR "dueAt" >= "startedAt");
ALTER TABLE "Deadline" ADD CONSTRAINT dl_scale_chk CHECK ("timeScale" >= 1);
ALTER TABLE "Evidence" ADD CONSTRAINT ev_chk
  CHECK (size > 0 AND size <= 10485760 AND sha256 ~ '^[0-9a-f]{64}$');
-- Aturan: bila ada durasi, harus positif; VERIFIED wajib punya sumber
ALTER TABLE "LegalRule" ADD CONSTRAINT lr_dur_chk
  CHECK ("durationHours" IS NULL OR "durationHours" > 0);
ALTER TABLE "LegalRule" ADD CONSTRAINT lr_verified_chk
  CHECK (status <> 'VERIFIED' OR ("sourceRef" IS NOT NULL AND "verifiedBy" IS NOT NULL));

-- Partial index untuk rekonsiliasi (hanya tenggat yang masih berjalan)
CREATE INDEX deadline_open_due_idx ON "Deadline" ("dueAt")
  WHERE "completedAt" IS NULL AND "dueAt" IS NOT NULL;
CREATE INDEX reminder_pending_idx ON "ScheduledReminder" ("fireAt")
  WHERE "firedAt" IS NULL;
CREATE INDEX outbox_unpublished_idx ON "OutboxEvent" ("createdAt")
  WHERE "publishedAt" IS NULL;
```

Migrasi data enum (Postgres tidak bisa menghapus nilai enum): buat tipe baru, `UPDATE ... SET status = CASE status WHEN 'REVIEWED' THEN 'DRAFT' WHEN 'COMPLETED' THEN 'CLOSED' ... END`, isi `closedAt = updatedAt` dan `closeReason = 'RESOLVED'` untuk bekas `COMPLETED`, lalu `ALTER COLUMN ... TYPE new USING`. Permintaan `SENT` yang `dueAt`-nya sudah lewat ditangani rekonsiliasi pertama (bukan migrasi). Semua dalam satu migrasi dan diuji di salinan seed.

## 4. Skema GraphQL (SDL)

Perubahan besar dari API sekarang ([api-documentation.md](api-documentation.md)): enum terdaftar (kini String), **cursor pagination** (kini `take/skip`), `reviewRequest` dan `completeRequest` dihapus (D-003), `escalateRequest` ditambah, kode error seragam. Upload bukti tetap REST (`POST /evidence/:requestId`), tidak masuk GraphQL.

```graphql
scalar DateTime
scalar JSON

# --- Enum ---
enum Role { USER MODERATOR ADMIN }
enum VerificationStatus { VERIFIED COMMUNITY_REPORTED UNVERIFIED OUTDATED }
enum ChannelType { PRIVACY_EMAIL DPO_EMAIL REQUEST_FORM POSTAL_ADDRESS PRIVACY_POLICY_URL }
enum RuleStatus { VERIFIED NEEDS_CONFIRMATION NOT_VERIFIED }
enum RequestStatus { DRAFT SENT ACKNOWLEDGED RESPONDED OVERDUE ESCALATED CLOSED }
enum CloseReason { CANCELLED WITHDRAWN RESOLVED UNRESOLVED }
enum EvidenceSource { USER_UPLOADED SYSTEM_RECORDED VERIFIED DISPUTED }
enum ResponseCategory {
  ACKNOWLEDGED ADDITIONAL_INFO_REQUESTED IN_PROGRESS FULFILLED
  PARTIALLY_FULFILLED REJECTED NO_RESPONSE OTHER
}
enum ReminderKind { APPROACHING PASSED FOLLOW_UP }
enum DeadlineBasis { SENT_ESTIMATE RECEIVED }
# Status tenggat untuk UI. NONE = tidak ada tenggat hukum (jangan tampilkan hitung mundur)
enum DeadlineState { NONE_NOT_VERIFIED NONE_NO_STATUTORY_DEADLINE RUNNING APPROACHING PASSED MET }
enum SubmissionStatus { PENDING APPROVED REJECTED }
enum ErrorCode { BAD_USER_INPUT UNAUTHENTICATED FORBIDDEN NOT_FOUND CONFLICT INVALID_TRANSITION RATE_LIMITED INTERNAL_SERVER_ERROR }

# --- Paginasi cursor ---
type PageInfo { endCursor: String hasNextPage: Boolean! }
input PageArgs { first: Int = 20  after: String }  # first maks 50

# --- Publik ---
type DataRight {
  code: ID!
  article: String!      # mis. "Ps. 32" hanya bila tervalidasi di LEGAL_SOURCES
  title: String!
  plainMeaning: String!
  needs: [String!]!
  requiresRecordedRequest: Boolean!
  activeRule: LegalRule
}

type LegalRule {
  id: ID!
  ruleKey: String!
  version: Int!
  right: DataRight!
  legalBasis: String!
  durationHours: Int          # null = tidak ada tenggat
  calcMethod: String!
  status: RuleStatus!
  exceptions: String
  sourceRef: String
  effectiveFrom: DateTime!
  supersededAt: DateTime
}

type PrivacyChannel {
  id: ID!
  type: ChannelType!
  value: String!
  status: VerificationStatus!
  sourceUrl: String
  lastCheckedAt: DateTime
}

type Company {
  id: ID!
  slug: String!
  name: String!
  brand: String
  industry: String!
  website: String
  channels: [PrivacyChannel!]!      # DataLoader per companyId
}
type CompanyEdge { cursor: String! node: Company! }
type CompanyConnection { edges: [CompanyEdge!]! pageInfo: PageInfo! }

# Statistik agregat: disembunyikan (null) bila sampel < k
type CompanyStats {
  sampleSize: Int!
  visible: Boolean!
  medianResponseHours: Float
  responseBreakdown: JSON
}

# --- Milik pengguna ---
type User { id: ID! email: String! name: String! role: Role! emailVerified: Boolean! createdAt: DateTime! }

type Deadline {
  state: DeadlineState!
  startedAt: DateTime
  dueAt: DateTime
  basis: DeadlineBasis
  legalBasis: String
  ruleStatus: RuleStatus
  ruleVersion: Int
  disclaimer: String!         # selalu terisi: estimasi, bukan nasihat hukum
  timeScaled: Boolean!        # true di mode demo
}

type TimelineEvent {
  id: ID!
  type: String!
  actor: String!
  description: String!
  occurredAt: DateTime!
  verification: EvidenceSource!
  evidence: Evidence
}

type Evidence {
  id: ID!
  originalName: String!
  mime: String!
  size: Int!
  sha256: String!
  source: EvidenceSource!
  createdAt: DateTime!
  downloadPath: String!       # /evidence/:id/download (REST, pemilik saja)
}

type CompanyResponse {
  id: ID!
  category: ResponseCategory!
  note: String
  receivedAt: DateTime!
  evidence: Evidence
}

type PrivacyRequest {
  id: ID!
  title: String!
  status: RequestStatus!
  closeReason: CloseReason
  right: DataRight!
  company: Company!
  channel: PrivacyChannel
  fields: JSON!
  letterBody: String!
  sentAt: DateTime
  sentVia: String
  receivedAt: DateTime
  overdueAt: DateTime
  escalatedAt: DateTime
  closedAt: DateTime
  followUpDays: Int!
  deadline: Deadline!
  timeline: [TimelineEvent!]!
  evidence: [Evidence!]!
  responses: [CompanyResponse!]!
  allowedTransitions: [RequestStatus!]!   # UI tidak menebak aturan state
  createdAt: DateTime!
  updatedAt: DateTime!
}
type RequestEdge { cursor: String! node: PrivacyRequest! }
type RequestConnection { edges: [RequestEdge!]! pageInfo: PageInfo! }

type Notification {
  id: ID!
  requestId: ID
  type: String!
  title: String!
  body: String!
  readAt: DateTime
  createdAt: DateTime!
}
type NotificationEdge { cursor: String! node: Notification! }
type NotificationConnection { edges: [NotificationEdge!]! pageInfo: PageInfo! unreadCount: Int! }

type Dossier {
  request: PrivacyRequest!
  generatedAt: DateTime!
  contentSha256: String!
  ruleVersion: Int
  disclaimer: String!
}

type ChannelSubmission {
  id: ID!
  company: Company!
  type: ChannelType!
  value: String!
  sourceUrl: String!
  status: SubmissionStatus!
  reviewNote: String
  createdAt: DateTime!
}
type AuditLog { id: ID! actorId: ID action: String! entity: String! entityId: ID createdAt: DateTime! }

# --- Query ---
type Query {
  # PUBLIC
  rights: [DataRight!]!
  legalRules(rightCode: ID): [LegalRule!]!
  companies(search: String, industry: String, status: VerificationStatus, page: PageArgs): CompanyConnection!
  company(slug: String!): Company
  industries: [String!]!
  companyStats(slug: String!): CompanyStats!
  # USER (milik sendiri; selain pemilik = NOT_FOUND)
  me: User
  myRequests(status: [RequestStatus!], page: PageArgs): RequestConnection!
  request(id: ID!): PrivacyRequest
  notifications(page: PageArgs): NotificationConnection!
  followUpLetter(requestId: ID!): String!
  dossierExport(requestId: ID!): Dossier!
  myDataExport: JSON!
  # MODERATOR+
  pendingSubmissions(page: PageArgs): [ChannelSubmission!]!
  # ADMIN
  adminLegalRules: [LegalRule!]!
  auditLogs(entity: String, page: PageArgs): [AuditLog!]!
}

# --- Input ---
input RegisterInput { email: String! password: String! name: String! }
input LoginInput { email: String! password: String! }
input CreateRequestInput { companyId: ID! rightCode: ID! channelId: ID fields: JSON! followUpDays: Int }
input RecordSentInput { requestId: ID! sentAt: DateTime! sentVia: String! evidenceId: ID }
input RecordReceiptInput { requestId: ID! receivedAt: DateTime! evidenceId: ID }
input CompanyResponseInput { requestId: ID! category: ResponseCategory! note: String receivedAt: DateTime! evidenceId: ID }
input SubmitChannelInput { companyId: ID! type: ChannelType! value: String! sourceUrl: String! }
input PublishLegalRuleInput {
  ruleKey: String! rightCode: ID! legalBasis: String! durationHours: Int calcMethod: String!
  status: RuleStatus! exceptions: String sourceRef: String! effectiveFrom: DateTime!
}

# --- Mutation ---
type Mutation {
  # PUBLIC / USER
  register(input: RegisterInput!): User!
  login(input: LoginInput!): User!
  logout: Boolean!
  deleteMyAccount: Boolean!
  # USER: siklus permintaan (setiap transisi tervalidasi domain/request.state)
  createRequest(input: CreateRequestInput!): PrivacyRequest!
  updateRequestFields(requestId: ID!, fields: JSON!): PrivacyRequest!      # hanya DRAFT
  generateLetter(requestId: ID!): PrivacyRequest!
  updateLetter(requestId: ID!, letterBody: String!): PrivacyRequest!      # hanya DRAFT
  recordRequestSent(input: RecordSentInput!): PrivacyRequest!             # DRAFT -> SENT, buat Deadline + Reminder + Outbox (satu transaksi)
  recordReceipt(input: RecordReceiptInput!): PrivacyRequest!              # set receivedAt, hitung ulang tenggat, catat di linimasa
  addCompanyResponse(input: CompanyResponseInput!): PrivacyRequest!       # -> ACKNOWLEDGED atau RESPONDED
  addTimelineNote(requestId: ID!, note: String!): PrivacyRequest!
  escalateRequest(requestId: ID!): PrivacyRequest!                        # -> ESCALATED (OVERDUE | RESPONDED | SENT tanpa tenggat)
  closeRequest(requestId: ID!, reason: CloseReason!): PrivacyRequest!
  markNotificationRead(id: ID!): Notification!
  markAllNotificationsRead: Int!
  submitChannel(input: SubmitChannelInput!): ChannelSubmission!
  # MODERATOR+
  reviewSubmission(id: ID!, approve: Boolean!, note: String): ChannelSubmission!
  upsertChannel(companyId: ID!, type: ChannelType!, value: String!, status: VerificationStatus!, sourceUrl: String): PrivacyChannel!  # VERIFIED hanya ADMIN
  upsertCompany(slug: String!, name: String!, industry: String!, website: String): Company!
  # ADMIN
  publishLegalRule(input: PublishLegalRuleInput!): LegalRule!             # selalu versi baru; VERIFIED wajib sourceRef
}
```

Catatan kontrak:
- **Error**: semua error GraphQL membawa `extensions.code` dari `ErrorCode`; tanpa stack trace; `INVALID_TRANSITION` bila transisi ditolak; `CONFLICT` bila conditional update kalah.
- **Otorisasi**: `request(id)` dan semua turunannya mengembalikan `NOT_FOUND` untuk non-pemilik (bukan `FORBIDDEN`) agar ID tidak bisa ditebak. Test negatif per resolver (GAP #14).
- **N+1**: DataLoader untuk `Company.channels`, `PrivacyRequest.{company,right,channel,deadline,evidence,responses,timeline}`, `TimelineEvent.evidence`.
- **Batas**: depth 8, complexity 300 (sudah ada), `first` maks 50, cursor = base64 `(createdAt,id)`.
- **Deadline.state** dihitung server dari status aturan + `dueAt` + `now`; UI **tidak** menghitung tenggat sendiri.
- **Mutasi baru yang butuh persetujuan**: `escalateRequest`; penghapusan `reviewRequest` dan `completeRequest` (ikut D-003).
