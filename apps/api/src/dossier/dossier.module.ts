// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Injectable, Module, NotFoundException } from "@nestjs/common";
import { Args, Field, Float, ID, ObjectType, Query, Resolver } from "@nestjs/graphql";
import { PrismaService } from "../prisma.service";
import { AuthUser, CurrentUser } from "../common/auth";
import { EvidenceT, JSONScalar } from "../gql/types";
import { responseTiming } from "../domain/response-timing";

@ObjectType()
export class DossierEventT {
  @Field(() => ID) id: string;
  @Field() type: string;
  @Field() actor: string;
  @Field() description: string;
  @Field(() => Date) occurredAt: Date;
  @Field() verification: string;
  @Field(() => JSONScalar, { nullable: true }) metadata?: unknown;
  @Field(() => EvidenceT, { nullable: true }) evidence?: EvidenceT;
}
@ObjectType()
export class DossierResponseT {
  @Field(() => ID) id: string;
  @Field() category: string;
  @Field({ nullable: true }) note?: string;
  @Field(() => Date) receivedAt: Date;
  @Field() simulated: boolean;
  @Field(() => Float, { nullable: true, description: "ms dari awal hitungan tenggat sampai balasan" }) elapsedMs?: number;
  @Field(() => Float, { nullable: true, description: "ms setelah estimasi tenggat; 0 bila tepat waktu; null bila tak ada tenggat" })
  lateByMs?: number;
  @Field(() => EvidenceT, { nullable: true }) evidence?: EvidenceT;
}
@ObjectType()
export class DeliveryT {
  @Field(() => ID) id: string;
  @Field() kind: string;
  @Field() toAddress: string;
  @Field() subject: string;
  @Field() messageId: string;
  @Field() contentSha256: string;
  @Field(() => Date) sentAt: Date;
}
@ObjectType()
export class DossierRequestT {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field() status: string;
  @Field() companyName: string;
  @Field(() => Date, { nullable: true }) sentAt?: Date;
  @Field(() => Date, { nullable: true }) dueAt?: Date;
  @Field(() => [DossierEventT]) events: DossierEventT[];
  @Field(() => [EvidenceT]) evidence: EvidenceT[];
  @Field(() => [DossierResponseT]) responses: DossierResponseT[];
}
@ObjectType()
export class DossierT {
  @Field(() => DossierRequestT) request: DossierRequestT;
  @Field(() => [DeliveryT]) deliveries: DeliveryT[];
}

@Injectable()
export class DossierService {
  constructor(private prisma: PrismaService) {}
  async get(user: AuthUser, requestId: string): Promise<DossierT> {
    const r = await this.prisma.privacyRequest.findFirst({
      where: { id: requestId, userId: user.id, deletedAt: null },
      include: {
        company: { select: { name: true } },
        deadline: true,
        events: { orderBy: { occurredAt: "asc" } },
        evidence: { orderBy: { createdAt: "asc" } },
        responses: { orderBy: { receivedAt: "asc" } },
        emailDeliveries: { orderBy: { sentAt: "asc" } },
      },
    });
    if (!r) throw new NotFoundException("Permintaan tidak ditemukan."); // 404 agar keberadaan ID tidak bocor
    const ev = new Map(r.evidence.map((e) => [e.id, e]));
    const since = r.deadline?.startedAt ?? r.sentAt;
    const dueAt = r.deadline?.dueAt ?? null;
    return {
      request: {
        id: r.id,
        title: r.title,
        status: r.status,
        companyName: r.company.name,
        sentAt: r.sentAt ?? undefined,
        dueAt: dueAt ?? undefined,
        events: r.events.map((e) => ({
          ...e,
          metadata: e.metadata ?? undefined,
          evidence: e.evidenceId ? ev.get(e.evidenceId) : undefined,
        })),
        evidence: r.evidence,
        responses: r.responses.map((x) => {
          const t = responseTiming(x.receivedAt, since, dueAt);
          return {
            id: x.id,
            category: x.category,
            note: x.note ?? undefined,
            receivedAt: x.receivedAt,
            simulated: x.simulated,
            elapsedMs: t.elapsedMs ?? undefined,
            lateByMs: t.lateByMs ?? undefined,
            evidence: x.evidenceId ? ev.get(x.evidenceId) : undefined,
          };
        }),
      },
      deliveries: r.emailDeliveries,
    };
  }
}

@Resolver()
export class DossierResolver {
  constructor(private s: DossierService) {}
  @Query(() => DossierT) dossier(@CurrentUser() u: AuthUser, @Args("requestId") id: string) {
    return this.s.get(u, id);
  }
}

@Module({ providers: [DossierService, DossierResolver] })
export class DossierModule {}
