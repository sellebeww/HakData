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
  /**
   * Hanya agregat tanpa identitas, dan hanya dari pengiriman TERVERIFIKASI: surat yang dikirim lewat email platform (ada EmailDelivery
   * REQUEST, waktu dan tujuan dicatat sistem, bukan diketik pengguna). Ambang k dihitung dari jumlah PENGGUNA berbeda, bukan jumlah permintaan,
   * sehingga satu akun tidak bisa mencapai ambang sendirian atau meracuni statistik. Di bawah ambang, tidak ada angka apa pun yang dikembalikan.
   */
  async forCompany(slug: string) {
    const c = await this.prisma.company.findUnique({ where: { slug } });
    if (!c) throw new NotFoundException("Perusahaan tidak ditemukan.");
    const reqs = await this.prisma.privacyRequest.findMany({
      where: { companyId: c.id, deletedAt: null, sentAt: { not: null }, emailDeliveries: { some: { kind: "REQUEST" } } },
      select: {
        userId: true,
        sentAt: true,
        evidence: { select: { id: true }, take: 1 },
        // NO_RESPONSE adalah catatan "tidak ada balasan", bukan balasan
        responses: { where: { category: { not: "NO_RESPONSE" } }, select: { receivedAt: true }, orderBy: { receivedAt: "asc" }, take: 1 },
      },
    });
    const n = reqs.length;
    const users = new Set(reqs.map((r) => r.userId)).size;
    const responded = reqs.filter((r) => r.responses.length);
    const sufficient = users >= config.minStatSample;
    const hours = responded.map((r) => (r.responses[0].receivedAt.getTime() - r.sentAt!.getTime()) / 3_600_000);
    const show = <T>(v: T) => (sufficient ? v : undefined);
    return {
      companySlug: slug,
      isDemoData: c.isDemo,
      sufficient,
      minSample: config.minStatSample,
      requestsRecorded: show(n),
      withEvidence: show(reqs.filter((r) => r.evidence.length).length),
      responsesRecorded: show(responded.length),
      responseRatio: show(n ? responded.length / n : undefined),
      medianResponseHours: sufficient && responded.length >= 3 ? Math.round((median(hours) ?? 0) * 10) / 10 : undefined,
      method: `Hanya permintaan yang dikirim lewat email platform (waktu dan tujuan dicatat sistem), dan hanya ditampilkan bila berasal dari minimal ${config.minStatSample} pengguna berbeda. Rasio = permintaan dengan minimal satu balasan tercatat (kategori "tidak ada respons" tidak dihitung) / permintaan terkirim. Median = selisih jam dari pengiriman ke balasan pertama, minimal 3 balasan. Isi balasan dicatat pengguna.`,
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
