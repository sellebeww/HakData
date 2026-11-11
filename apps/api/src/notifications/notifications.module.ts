// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Module } from "@nestjs/common";
import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaService } from "../prisma.service";
import { AuthUser, CurrentUser } from "../common/auth";
import { NotificationT } from "../gql/types";
import { RabbitService } from "./rabbit.service";
import { ReminderService } from "./reminders.service";

export { ReminderService };

@Resolver()
export class NotificationsResolver {
  constructor(private prisma: PrismaService) {}
  @Query(() => [NotificationT]) notifications(
    @CurrentUser() u: AuthUser,
    @Args("take", { type: () => Int, defaultValue: 50 }) take: number,
  ) {
    return this.prisma.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: Math.min(take, 100) });
  }
  @Query(() => Int) unreadCount(@CurrentUser() u: AuthUser) {
    return this.prisma.notification.count({ where: { userId: u.id, readAt: null } });
  }
  @Mutation(() => Boolean) async markNotificationRead(@CurrentUser() u: AuthUser, @Args("id") id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: u.id, readAt: null }, data: { readAt: new Date() } });
    return true;
  }
  @Mutation(() => Boolean) async markAllNotificationsRead(@CurrentUser() u: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
    return true;
  }
}
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [{ provide: RabbitService, useFactory: () => new RabbitService() }, ReminderService, NotificationsResolver],
  exports: [ReminderService, RabbitService],
})
export class NotificationsModule {}
