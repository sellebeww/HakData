// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Field, ID, Int, ObjectType } from "@nestjs/graphql";
import { GraphQLScalarType, Kind, ValueNode } from "graphql";

const lit = (n: ValueNode): unknown =>
  n.kind === Kind.OBJECT
    ? Object.fromEntries(n.fields.map((f) => [f.name.value, lit(f.value)]))
    : n.kind === Kind.LIST
      ? n.values.map(lit)
      : "value" in n
        ? (n as { value: unknown }).value
        : null;
export const JSONScalar = new GraphQLScalarType({ name: "JSON", serialize: (v) => v, parseValue: (v) => v, parseLiteral: lit });

@ObjectType()
export class UserT {
  @Field(() => ID) id: string;
  @Field() email: string;
  @Field() name: string;
  @Field() role: string;
}
@ObjectType()
export class FieldDefT {
  @Field() key: string;
  @Field() label: string;
  @Field() required: boolean;
  @Field() why: string;
  @Field() multiline: boolean;
}
@ObjectType()
export class RightT {
  @Field() code: string;
  @Field() article: string;
  @Field() title: string;
  @Field() plainMeaning: string;
  @Field(() => [FieldDefT]) fields: FieldDefT[];
}
@ObjectType()
export class LegalRuleT {
  @Field(() => ID) id: string;
  @Field() ruleKey: string;
  @Field(() => Int) version: number;
  @Field() rightCode: string;
  @Field() legalBasis: string;
  @Field(() => Int, { nullable: true }) durationHours?: number;
  @Field() calcMethod: string;
  @Field() status: string;
  @Field({ nullable: true }) exceptions?: string;
  @Field({ nullable: true }) applicability?: string;
  @Field({ nullable: true }) verifiedBy?: string;
  @Field({ nullable: true, description: "Rujukan sumber hukum; wajib untuk aturan VERIFIED" }) sourceRef?: string;
  @Field(() => Date, { nullable: true }) lastReviewedAt?: Date;
  @Field(() => Date) effectiveFrom: Date;
  @Field(() => Date, { nullable: true }) supersededAt?: Date;
}
@ObjectType()
export class ChannelT {
  @Field(() => ID) id: string;
  @Field() type: string;
  @Field() value: string;
  @Field() status: string;
  @Field({ nullable: true }) sourceUrl?: string;
  @Field(() => Date, { nullable: true }) lastCheckedAt?: Date;
  @Field({ nullable: true }) note?: string;
}
@ObjectType()
export class CompanyT {
  @Field(() => ID) id: string;
  @Field() slug: string;
  @Field() name: string;
  @Field({ nullable: true }) brand?: string;
  @Field({ nullable: true }) legalName?: string;
  @Field() industry: string;
  @Field({ nullable: true }) website?: string;
  @Field() isDemo: boolean;
  @Field({ nullable: true }) notes?: string;
}
@ObjectType()
export class CompanyPageT {
  @Field(() => [CompanyT]) items: CompanyT[];
  @Field(() => Int) total: number;
}
@ObjectType()
export class PageInfoT {
  @Field(() => String, { nullable: true }) endCursor?: string;
  @Field() hasNextPage: boolean;
}
@ObjectType()
export class CompanyEdgeT {
  @Field() cursor: string;
  @Field(() => CompanyT) node: CompanyT;
}
@ObjectType()
export class CompanyConnectionT {
  @Field(() => [CompanyEdgeT]) edges: CompanyEdgeT[];
  @Field(() => PageInfoT) pageInfo: PageInfoT;
}
@ObjectType()
export class SubmissionT {
  @Field(() => ID) id: string;
  @Field() companyName: string;
  @Field() type: string;
  @Field() value: string;
  @Field() sourceUrl: string;
  @Field() status: string;
  @Field({ nullable: true }) reviewNote?: string;
  @Field(() => Date) createdAt: Date;
}
@ObjectType()
export class DeadlineT {
  @Field() ruleKey: string;
  @Field(() => Int) ruleVersion: number;
  @Field() legalBasis: string;
  @Field() ruleStatus: string;
  @Field(() => Date) startedAt: Date;
  @Field(() => Date, { nullable: true }) dueAt?: Date;
  @Field() status: string;
  @Field() timezone: string;
  @Field() basisNote: string;
  @Field() disclaimer: string;
  @Field({ nullable: true }) exceptions?: string;
}
@ObjectType()
export class TimelineEventT {
  @Field(() => ID) id: string;
  @Field() type: string;
  @Field() actor: string;
  @Field() description: string;
  @Field(() => Date) occurredAt: Date;
  @Field() verification: string;
  @Field(() => JSONScalar, { nullable: true }) metadata?: unknown;
  @Field({ nullable: true }) evidenceId?: string;
}
@ObjectType()
export class EvidenceT {
  @Field(() => ID) id: string;
  @Field() originalName: string;
  @Field() mime: string;
  @Field(() => Int) size: number;
  @Field() sha256: string;
  @Field() source: string;
  @Field(() => Date) createdAt: Date;
}
@ObjectType()
export class ResponseT {
  @Field(() => ID) id: string;
  @Field() category: string;
  @Field({ nullable: true }) note?: string;
  @Field(() => Date) receivedAt: Date;
  @Field({ nullable: true }) evidenceId?: string;
}
@ObjectType()
export class RequestT {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field() status: string;
  @Field() rightCode: string;
  @Field(() => RightT) right: RightT;
  @Field(() => CompanyT) company: CompanyT;
  @Field(() => ChannelT, { nullable: true }) channel?: ChannelT;
  @Field(() => JSONScalar) fields: unknown;
  @Field() letterBody: string;
  @Field() letterDisclaimer: string;
  @Field(() => Date, { nullable: true }) sentAt?: Date;
  @Field({ nullable: true }) sentVia?: string;
  @Field(() => Date, { nullable: true }) receivedAt?: Date;
  @Field(() => Int) followUpDays: number;
  @Field(() => Date) createdAt: Date;
  @Field(() => DeadlineT, { nullable: true }) deadline?: DeadlineT;
  @Field(() => [TimelineEventT]) timeline: TimelineEventT[];
  @Field(() => [EvidenceT]) evidence: EvidenceT[];
  @Field(() => [ResponseT]) responses: ResponseT[];
}
@ObjectType()
export class RequestSummaryT {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field() status: string;
  @Field() rightCode: string;
  @Field() companyName: string;
  @Field() companySlug: string;
  @Field(() => Date, { nullable: true }) sentAt?: Date;
  @Field(() => Date, { nullable: true }) dueAt?: Date;
  @Field({ nullable: true }) deadlineStatus?: string;
  @Field(() => Date) updatedAt: Date;
}
@ObjectType()
export class NotificationT {
  @Field(() => ID) id: string;
  @Field({ nullable: true }) requestId?: string;
  @Field() type: string;
  @Field() title: string;
  @Field() body: string;
  @Field(() => Date, { nullable: true }) readAt?: Date;
  @Field(() => Date) createdAt: Date;
}
@ObjectType()
export class StatsT {
  @Field() companySlug: string;
  @Field() isDemoData: boolean;
  @Field() sufficient: boolean;
  @Field(() => Int) minSample: number;
  @Field(() => Int, { nullable: true, description: "null di bawah ambang pengguna" }) requestsRecorded?: number;
  @Field(() => Int, { nullable: true }) withEvidence?: number;
  @Field(() => Int, { nullable: true }) responsesRecorded?: number;
  @Field({ nullable: true }) responseRatio?: number;
  @Field({ nullable: true }) medianResponseHours?: number;
  @Field() method: string;
  @Field() label: string;
}
@ObjectType()
export class AuditLogT {
  @Field(() => ID) id: string;
  @Field({ nullable: true }) actorId?: string;
  @Field() action: string;
  @Field() entity: string;
  @Field({ nullable: true }) entityId?: string;
  @Field(() => JSONScalar, { nullable: true }) meta?: unknown;
  @Field(() => Date) createdAt: Date;
}
@ObjectType()
export class DataExportT {
  @Field(() => JSONScalar) data: unknown;
}
