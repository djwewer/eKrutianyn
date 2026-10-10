import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JunakImportModule } from '../junak-import/junak-import.module';
import { KurinsModule } from '../kurins/kurins.module';
import { UsersModule } from '../users/users.module';
import { ApprovalRequestsController } from './approval-requests.controller';
import { ApprovalRequestsService } from './approval-requests.service';

@Module({
  imports: [AuthModule, JunakImportModule, KurinsModule, UsersModule],
  controllers: [ApprovalRequestsController],
  providers: [ApprovalRequestsService],
})
export class ApprovalRequestsModule {}
