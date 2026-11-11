// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Injectable, Module, NotFoundException } from "@nestjs/common";
import { Args, Query, Resolver } from "@nestjs/graphql";
import { PrismaService } from "../prisma.service";
import { Public } from "../common/auth";
import { config } from "../common/config";
import { StatsT } from "../gql/types";

export const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}
  /** Hanya agregat tanpa identitas. Di bawah ambang sampel, angka rasio/median TIDAK ditampilkan (cegah re-identifikasi & statistik menyesatkan). */
  async forCompany(slug: string) {
    const c = await this.prisma.company.findUnique({ where: { slug } });
    if (!c) throw new NotFoundException("Perusahaan tidak ditemukan.");
    const reqs = await this.prisma.privacyRequest.findMany({
      where: { companyId: c.id, deletedAt: null, sentAt: { not: null } },
      select: {
        sentAt: true,
        evidence: { select: { id: true }, take: 1 },
        responses: { select: { receivedAt: true }, orderBy: { receivedAt: "asc" }, take: 1 },
      },
    });
    const n = reqs.length;
    const responded = reqs.filter((r) => r.responses.length);
    const sufficient = n >= config.minStatSample;
    const hours = responded.map((r) => (r.responses[0].receivedAt.getTime() - r.sentAt!.getTime()) / 3_600_000);
    return {
      companySlug: slug,
      isDemoData: c.isDemo,
      sufficient,
      minSample: config.minStatSample,
      requestsRecorded: n,
      withEvidence: reqs.filter((r) => r.evidence.length).length,
      responsesRecorded: responded.length,
      responseRatio: sufficient ? responded.length / n : undefined,
      medianResponseHours: sufficient && responded.length >= 3 ? Math.round((median(hours) ?? 0) * 10) / 10 : undefined,
      method:
        "Rasio = permintaan dengan minimal satu respons tercatat / permintaan yang sudah dikirim. Median = selisih jam dari pengiriman ke respons pertama, minimal 3 respons. Seluruh angka dicatat sendiri oleh pengguna.",
      label: c.isDemo
        ? "DATA DEMO. Bukan data nyata."
        : "Data dicatat pengguna Hak Data, belum diverifikasi independen. Bukan peringkat dan bukan penilaian kepatuhan hukum.",
    };
  }
}
@Resolver()
export class StatsResolver {
  constructor(private s: StatsService) {}
  @Public() @Query(() => StatsT) companyStats(@Args("slug") slug: string) {
    return this.s.forCompany(slug);
  }
}
@Module({ providers: [StatsService, StatsResolver] })
export class StatsModule {}
