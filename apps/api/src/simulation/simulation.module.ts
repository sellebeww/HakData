// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Injectable, Logger, Module } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../prisma.service";
import { scaled } from "../deadlines/deadline.clock";
import { RequestsModule } from "../requests/requests.module";
import { RequestsService } from "../requests/requests.service";

/** Posisi balasan dalam rentang [awal hitungan, dueAt]: 0.4 = tepat waktu, 1.3 = terlambat 30% dari rentang. */
export const REPLY_AT = { REPLIES: 0.4, REPLIES_LATE: 1.3 } as const;
const FALLBACK_SPAN_MS = 72 * 3_600_000; // aturan tanpa dueAt: dasar 72 jam, diskalakan DEADLINE_TIME_SCALE

/**
 * Mode demo: perusahaan `isDemo` dengan `simulation` membalas (tepat waktu / terlambat) atau diam (SILENT) agar alur tenggat terlihat dalam detik.
 * Tanpa tabel/antrean baru: waktu balasan dihitung deterministik dari DB, jadi tahan restart. Hanya permintaan yang dikirim lewat email platform
 * (punya EmailDelivery) yang disimulasikan; data seed lama tidak tersentuh.
 */
@Injectable()
export class SimulationService {
  private log = new Logger("Simulation");
  private busy = false;
  constructor(
    private prisma: PrismaService,
    private requests: RequestsService,
  ) {}

  @Interval(1_000) async tickJob() {
    if (process.env.DEMO_MODE !== "true" || process.env.DISABLE_SCHEDULER === "1" || this.busy) return;
    this.busy = true;
    try {
      await this.tick();
    } catch (e) {
      this.log.error((e as Error).message);
    } finally {
      this.busy = false;
    }
  }

  /** Mengembalikan jumlah balasan yang dicatat. Idempoten: permintaan yang sudah punya balasan tidak diproses lagi. */
  async tick(now = new Date()): Promise<number> {
    const rows = await this.prisma.privacyRequest.findMany({
      where: {
        deletedAt: null,
        status: { in: ["SENT", "OVERDUE"] },
        sentAt: { not: null },
        company: { isDemo: true, simulation: { in: ["REPLIES", "REPLIES_LATE"] } },
        responses: { none: {} },
        emailDeliveries: { some: { kind: "REQUEST" } },
        deadline: { isNot: null }, // dikirim lewat alur platform (jadwal dihitung); agregat demo dari seed tidak punya jadwal dan tidak disentuh
      },
      include: { company: { select: { simulation: true } }, deadline: true },
      take: 50,
    });
    let n = 0;
    for (const r of rows) {
      const sim = r.company.simulation as "REPLIES" | "REPLIES_LATE";
      const since = r.deadline?.startedAt ?? r.sentAt!;
      const span = r.deadline?.dueAt ? r.deadline.dueAt.getTime() - since.getTime() : scaled(FALLBACK_SPAN_MS);
      const replyAt = new Date(since.getTime() + span * REPLY_AT[sim]);
      if (replyAt > now) continue;
      try {
        await this.requests.addSimulatedResponse(r.id, {
          category: sim === "REPLIES" ? "FULFILLED" : "PARTIALLY_FULFILLED",
          note:
            sim === "REPLIES"
              ? "Balasan simulasi: permintaan dipenuhi tepat waktu."
              : "Balasan simulasi: dipenuhi sebagian, setelah estimasi tenggat.",
          receivedAt: replyAt, // waktu terjadwal, bukan waktu tick, agar selisih/keterlambatan deterministik
        });
        n++;
      } catch (e) {
        this.log.warn(`Simulasi ${r.id} dilewati: ${(e as Error).message}`); // mis. pengguna menutup permintaan di tengah jalan
      }
    }
    return n;
  }
}

@Module({ imports: [RequestsModule], providers: [SimulationService], exports: [SimulationService] })
export class SimulationModule {}
