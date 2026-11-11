// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { ExecutionContext, Injectable, Logger, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { GqlExecutionContext, GraphQLModule } from "@nestjs/graphql";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { getComplexity, simpleEstimator } from "graphql-query-complexity";
import depthLimit from "graphql-depth-limit";
import { GraphQLError } from "graphql";
import { PrismaModule } from "./prisma.service";
import { AuditModule } from "./common/audit";
import { AuthGuard } from "./common/auth";
import { config } from "./common/config";
import { AuthModule } from "./auth/auth.module";
import { CatalogModule } from "./catalog/catalog.module";
import { CompaniesModule } from "./companies/companies.module";
import { RequestsModule } from "./requests/requests.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { StatsModule } from "./stats/stats.module";
import { AdminModule } from "./admin/admin.module";
import { HealthModule } from "./health/health.module";
import { LettersModule } from "./letters/letters.module";
import { DeadlinesModule } from "./deadlines/deadlines.module";
import { DossierModule } from "./dossier/dossier.module";
import { EvidenceModule } from "./evidence/evidence.module";

const MAX_DEPTH = 8,
  MAX_COMPLEXITY = 300;
const log = new Logger("GraphQL");
const complexityPlugin = {
  async requestDidStart() {
    return {
      async didResolveOperation({ request, document, schema }: any) {
        const c = getComplexity({
          schema,
          operationName: request.operationName,
          query: document,
          variables: request.variables,
          estimators: [simpleEstimator({ defaultComplexity: 1 })],
        });
        if (c > MAX_COMPLEXITY) throw new GraphQLError(`Kueri terlalu kompleks (${c} > ${MAX_COMPLEXITY}).`);
      },
    };
  },
};

@Injectable()
class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(ctx: ExecutionContext) {
    if (ctx.getType<string>() === "http") return { req: ctx.switchToHttp().getRequest(), res: ctx.switchToHttp().getResponse() };
    const g = GqlExecutionContext.create(ctx).getContext();
    return { req: g.req, res: g.res };
  }
}
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.RATE_LIMIT ?? 240) }]),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      csrfPrevention: true,
      introspection: !config.isProd,
      context: ({ req, res }: any) => ({ req, res }),
      validationRules: [depthLimit(MAX_DEPTH)],
      plugins: [complexityPlugin as never],
      formatError: (e: any) => {
        const status: number | undefined = e.extensions?.originalError?.statusCode ?? e.extensions?.http?.status;
        const CODES: Record<number, string> = {
          400: "BAD_USER_INPUT",
          401: "UNAUTHENTICATED",
          403: "FORBIDDEN",
          404: "NOT_FOUND",
          429: "TOO_MANY_REQUESTS",
        };
        if (status && status < 500) {
          const m = e.extensions?.originalError?.message;
          return { message: Array.isArray(m) ? m.join(", ") : e.message, extensions: { code: CODES[status] ?? "BAD_USER_INPUT" } };
        }
        const code = e.extensions?.code;
        if (
          ["GRAPHQL_VALIDATION_FAILED", "BAD_USER_INPUT", "UNAUTHENTICATED", "FORBIDDEN", "PERSISTED_QUERY_NOT_FOUND"].includes(code) ||
          (e.locations && !e.path)
        )
          return { message: e.message, extensions: { code } };
        if (e.originalError instanceof GraphQLError || e.message.startsWith("Kueri terlalu"))
          return { message: e.message, extensions: { code: "BAD_USER_INPUT" } };
        log.error(e.message, e.extensions?.stacktrace);
        return { message: "Terjadi kesalahan pada server. Silakan coba lagi.", extensions: { code: "INTERNAL_SERVER_ERROR" } };
      },
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    CatalogModule,
    CompaniesModule,
    RequestsModule,
    NotificationsModule,
    StatsModule,
    AdminModule,
    HealthModule,
    LettersModule,
    DeadlinesModule,
    DossierModule,
    EvidenceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
