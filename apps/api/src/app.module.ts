import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { AdminModule } from './admin/admin.module';
import { HurtkyModule } from './hurtky/hurtky.module';
import { UsersModule } from './users/users.module';
import { VykhovnykAssignmentsModule } from './vykhovnyk-assignments/vykhovnyk-assignments.module';
import { ProbyProgressModule } from './proby-progress/proby-progress.module';
import { KurinsModule } from './kurins/kurins.module';
import { ApprovalRequestsModule } from './approval-requests/approval-requests.module';
import { JunakDegreesModule } from './junak-degrees/junak-degrees.module';
import { ProbyCatalogModule } from './proby-catalog/proby-catalog.module';
import { KurinPositionsModule } from './kurin-positions/kurin-positions.module';
import { GuardianContactsModule } from './guardian-contacts/guardian-contacts.module';
import { InventoryModule } from './inventory/inventory.module';
import { PysarstvoModule } from './pysarstvo/pysarstvo.module';
import { JunakImportModule } from './junak-import/junak-import.module';
import { AiAssistantModule } from './ai-assistant/ai-assistant.module';
import { ReferenceSourcesModule } from './reference-sources/reference-sources.module';
import { TreasuryModule } from './treasury/treasury.module';
import { JunakActivityModule } from './junak-activity/junak-activity.module';
import { KurinCalendarModule } from './kurin-calendar/kurin-calendar.module';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { SkillsModule } from './skills/skills.module';
import { JunakHistoryModule } from './junak-history/junak-history.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AuthModule,
    MailModule,
    AdminModule,
    HurtkyModule,
    UsersModule,
    VykhovnykAssignmentsModule,
    ProbyProgressModule,
    KurinsModule,
    ApprovalRequestsModule,
    JunakDegreesModule,
    ProbyCatalogModule,
    KurinPositionsModule,
    GuardianContactsModule,
    InventoryModule,
    PysarstvoModule,
    JunakImportModule,
    AiAssistantModule,
    ReferenceSourcesModule,
    TreasuryModule,
    JunakActivityModule,
    KurinCalendarModule,
    PushNotificationsModule,
    AnnouncementsModule,
    SkillsModule,
    JunakHistoryModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
