<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# API
GraphQL `POST /graphql` (introspeksi mati di production). Sesi: cookie `hd_session` httpOnly. Peran: PUBLIC, USER, MODERATOR, ADMIN. Kesalahan: kode `BAD_USER_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_SERVER_ERROR` (tanpa stack trace).
| Operasi | Akses |
|---|---|
| Query: rights, legalRules, companies(search,industry,status,take,skip), company(slug), industries, companyStats(slug), me | PUBLIC |
| Query: myRequests, request(id), notifications, unreadCount, followUpLetter, dossierExport, myDataExport | USER (milik sendiri) |
| Mutation: register, login, logout, deleteMyAccount | PUBLIC/USER |
| Mutation: createRequest, updateRequestFields, generateLetter, updateLetter, reviewRequest, recordRequestSent, recordReceipt, addCompanyResponse, addTimelineNote, completeRequest, closeRequest, markNotificationRead, markAllNotificationsRead, submitChannel | USER |
| pendingSubmissions, reviewSubmission, upsertCompany, upsertChannel (VERIFIED hanya ADMIN) | MODERATOR+ |
| adminLegalRules, publishLegalRule, auditLogs | ADMIN |
REST: `POST /evidence/:requestId` (multipart `file`, PDF/PNG/JPG/WEBP maks 10 MB), `GET /evidence/:id/download` (pemilik saja, attachment, nosniff), `GET /health`.
Skema lengkap: jalankan API dan introspeksi di non-production. Enum GraphQL belum didaftarkan; status berupa String.
