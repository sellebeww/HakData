// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// Seed idempoten. SEMUA perusahaan di sini adalah DEMO fiktif (alamat memakai TLD .example yang dicadangkan RFC 2606). Tidak ada data perusahaan nyata.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/common/password";
import { RIGHTS } from "../src/domain/rights.catalog";

const prisma = new PrismaClient();
export const DEMO_PASSWORD = "DemoPass!2026";
const V = "Peneliti pengembang (dibantu AI). Belum ditinjau ahli hukum. Lihat docs/legal-research.md";
const EFFECTIVE = new Date("2022-10-17T00:00:00Z");
// Hanya 4 hak dengan angka tenggat eksplisit di UU 27/2022. Sisanya sengaja NOT_VERIFIED (lihat docs/legal-research.md §3).
const RULES: Record<string, { hours: number | null; basis: string; exc?: string; note?: string }> = {
  ACCESS: {
    hours: 72,
    basis: "UU 27/2022 Pasal 32 ayat (2)",
    exc: "Pasal 33 (wajib menolak bila membahayakan keselamatan/membuka data orang lain/pertahanan keamanan) dan Pasal 50.",
  },
  CORRECTION: { hours: 72, basis: "UU 27/2022 Pasal 30 ayat (1)", exc: "Pasal 50." },
  WITHDRAW_CONSENT: { hours: 72, basis: "UU 27/2022 Pasal 40 ayat (2)" },
  RESTRICT: {
    hours: 72,
    basis: "UU 27/2022 Pasal 41 ayat (1)",
    exc: "Pasal 41 ayat (2): ketentuan perundang-undangan, keselamatan pihak lain, atau perjanjian tertulis.",
  },
  DELETE: {
    hours: null,
    basis: "UU 27/2022 Pasal 8, 42, 43, 44, 45: tidak ada angka tenggat di UU",
    exc: "Pasal 43 ayat (2), Pasal 44 ayat (2), Pasal 50.",
  },
  OBJECT_AUTOMATED: { hours: null, basis: "UU 27/2022 Pasal 10: tata cara menunggu Peraturan Pemerintah" },
};

// Perilaku mode demo (DEMO_MODE=true): toko membalas tepat waktu, dompet membalas terlambat, seluler diam (lalu OVERDUE -> eskalasi).
const SIMULATION = { "demo-toko-contoh": "REPLIES", "demo-dompet-contoh": "REPLIES_LATE", "demo-seluler-contoh": "SILENT" } as const;

const COMPANIES = [
  {
    slug: "demo-toko-contoh",
    name: "DEMO · Toko Contoh",
    brand: "TokoContoh",
    industry: "E-commerce",
    website: "https://toko-contoh.example",
    channels: [
      { type: "PRIVACY_EMAIL", value: "privacy@toko-contoh.example", status: "OFFICIAL", sourceUrl: "https://toko-contoh.example/privasi" },
      {
        type: "PRIVACY_POLICY_URL",
        value: "https://toko-contoh.example/privasi",
        status: "OFFICIAL",
        sourceUrl: "https://toko-contoh.example/privasi",
      },
    ],
  },
  {
    slug: "demo-dompet-contoh",
    name: "DEMO · Dompet Contoh",
    brand: "DompetContoh",
    industry: "Fintech",
    website: "https://dompet-contoh.example",
    channels: [
      {
        type: "DPO_EMAIL",
        value: "dpo@dompet-contoh.example",
        status: "COMMUNITY_VERIFIED",
        sourceUrl: "https://dompet-contoh.example/kebijakan",
      },
      { type: "REQUEST_FORM", value: "https://dompet-contoh.example/permintaan-data", status: "UNVERIFIED" },
    ],
  },
  {
    slug: "demo-seluler-contoh",
    name: "DEMO · Seluler Contoh",
    brand: "SelulerContoh",
    industry: "Telekomunikasi",
    website: "https://seluler-contoh.example",
    channels: [
      {
        type: "PRIVACY_EMAIL",
        value: "privasi@seluler-contoh.example",
        status: "UNVERIFIED",
        sourceUrl: "https://seluler-contoh.example/privasi",
      },
    ],
  },
];

async function main() {
  for (const r of RIGHTS) {
    await prisma.dataRight.upsert({
      where: { code: r.code },
      create: {
        code: r.code,
        article: r.article,
        title: r.title,
        plainMeaning: r.plainMeaning,
        sortOrder: r.sortOrder,
        needs: r.fields.filter((f) => f.required).map((f) => f.label),
      },
      update: {
        article: r.article,
        title: r.title,
        plainMeaning: r.plainMeaning,
        needs: r.fields.filter((f) => f.required).map((f) => f.label),
      },
    });
    await prisma.requestTemplate.upsert({
      where: { rightCode_version: { rightCode: r.code, version: 1 } },
      create: { rightCode: r.code, version: 1, body: r.templateBody },
      update: { body: r.templateBody },
    });
    const rule = RULES[r.code];
    await prisma.legalRule.upsert({
      where: { ruleKey_version: { ruleKey: r.code, version: 1 } },
      create: {
        ruleKey: r.code,
        version: 1,
        rightCode: r.code,
        legalBasis: rule.basis,
        durationHours: rule.hours,
        status: rule.hours ? "VERIFIED" : "NOT_VERIFIED",
        exceptions: rule.exc,
        verifiedBy: V,
        // aturan VERIFIED wajib punya sumber (CHECK lr_verified_chk); NOT_VERIFIED tidak mengklaim sumber
        sourceRef: rule.hours ? rule.basis : null,
        lastReviewedAt: new Date("2026-11-11"),
        effectiveFrom: EFFECTIVE,
      },
      update: {},
    }); // jangan menimpa aturan yang sudah dikelola admin
  }
  for (const c of COMPANIES) {
    const co = await prisma.company.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        name: c.name,
        brand: c.brand,
        industry: c.industry,
        website: c.website,
        isDemo: true,
        simulation: SIMULATION[c.slug as keyof typeof SIMULATION],
        notes: "DATA DEMO fiktif untuk demonstrasi.",
      },
      update: { simulation: SIMULATION[c.slug as keyof typeof SIMULATION] },
    });
    for (const ch of c.channels)
      await prisma.privacyChannel.upsert({
        where: { companyId_type_value: { companyId: co.id, type: ch.type as never, value: ch.value } },
        create: {
          companyId: co.id,
          type: ch.type as never,
          value: ch.value,
          status: ch.status as never,
          sourceUrl: ch.sourceUrl,
          lastCheckedAt: new Date(),
          note: "DEMO",
        },
        update: {},
      });
  }
  const hash = await hashPassword(DEMO_PASSWORD);
  for (const [email, name, role] of [
    ["admin@hakdata.demo", "Admin Demo", "ADMIN"],
    ["moderator@hakdata.demo", "Moderator Demo", "MODERATOR"],
    ["user@hakdata.demo", "Pengguna Demo", "USER"],
  ] as const)
    await prisma.user.upsert({
      where: { email },
      create: { email, name, role, passwordHash: hash, emailVerifiedAt: new Date() },
      update: {},
    });

  // Agregat demo: 12 permintaan SIMULASI pada perusahaan DEMO agar statistik dapat didemokan (di atas ambang sampel). Berlabel DATA DEMO di API/UI.
  const toko = await prisma.company.findUniqueOrThrow({ where: { slug: "demo-toko-contoh" } });
  if (!(await prisma.privacyRequest.count({ where: { companyId: toko.id } }))) {
    for (let i = 0; i < 12; i++) {
      const u = await prisma.user.upsert({
        where: { email: `sim${i}@hakdata.demo` },
        create: { email: `sim${i}@hakdata.demo`, name: `Simulasi ${i}`, passwordHash: hash, emailVerifiedAt: new Date() },
        update: {},
      });
      const sentAt = new Date(Date.now() - (20 + i) * 864e5);
      const r = await prisma.privacyRequest.create({
        data: {
          userId: u.id,
          companyId: toko.id,
          rightCode: "ACCESS",
          title: "DEMO simulasi",
          fields: {},
          status: i % 3 ? "RESPONDED" : "SENT",
          sentAt,
          sentVia: "EMAIL",
        },
      });
      if (i % 3)
        await prisma.companyResponse.create({
          data: { requestId: r.id, category: "ACKNOWLEDGED", receivedAt: new Date(sentAt.getTime() + (10 + i * 6) * 36e5), note: "DEMO" },
        });
      if (i % 2)
        await prisma.evidence.create({
          data: {
            requestId: r.id,
            storageKey: `demo-${r.id}`,
            originalName: "demo.pdf",
            mime: "application/pdf",
            size: 1,
            sha256: "0".repeat(64),
          },
        });
    }
  }
  // Statistik hanya menghitung pengiriman lewat email platform: beri bukti kirim DEMO pada permintaan simulasi (idempoten, juga untuk DB lama).
  for (const r of await prisma.privacyRequest.findMany({
    where: { companyId: toko.id, title: "DEMO simulasi", emailDeliveries: { none: {} } },
  }))
    await prisma.emailDelivery.create({
      data: {
        requestId: r.id,
        kind: "REQUEST",
        toAddress: "privacy@toko-contoh.example",
        subject: "DEMO simulasi",
        messageId: `<demo-${r.id}@hakdata.local>`,
        contentSha256: "0".repeat(64),
        sentAt: r.sentAt!,
      },
    });
  console.log("Seed selesai");
}
main().finally(() => prisma.$disconnect());
