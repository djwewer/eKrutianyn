import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { AdminModule } from './admin/admin.module';
import { HurtkyModule } from './hurtky/hurtky.module';
import { UsersModule } from './users/users.module';
import { VykhovnykAssignmentsModule } from './vykhovnyk-assignments/vykhovnyk-assignments.module';
import { ProbyProgressModule } from './proby-progress/proby-progress.module';
import { KurinsModule } from './kurins/kurins.module';
import { ApprovalRequestsModule } from './approval-requests/approval-requests.module';
import { ProbyCatalogModule } from './proby-catalog/proby-catalog.module';
import { KurinPositionsModule } from './kurin-positions/kurin-positions.module';
import { GuardianContactsModule } from './guardian-contacts/guardian-contacts.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    MailModule,
    AdminModule,
    HurtkyModule,
    UsersModule,
    VykhovnykAssignmentsModule,
    ProbyProgressModule,
    KurinsModule,
    ApprovalRequestsModule,
    ProbyCatalogModule,
    KurinPositionsModule,
    GuardianContactsModule,
    InventoryModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
