import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { HurtkyModule } from './hurtky/hurtky.module';
import { UsersModule } from './users/users.module';
import { VykhovnykAssignmentsModule } from './vykhovnyk-assignments/vykhovnyk-assignments.module';
import { ProbyProgressModule } from './proby-progress/proby-progress.module';
import { KurinsModule } from './kurins/kurins.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AdminModule,
    HurtkyModule,
    UsersModule,
    VykhovnykAssignmentsModule,
    ProbyProgressModule,
    KurinsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
