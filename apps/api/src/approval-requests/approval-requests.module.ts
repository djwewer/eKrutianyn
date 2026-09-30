import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JunakImportModule } from '../junak-import/junak-import.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { UsersModule } from '../users/users.module';
import { ApprovalRequestsController } from './approval-requests.controller';
import { ApprovalRequestsService } from './approval-requests.service';

@Module({
  imports: [AuthModule, JunakImportModule, GoogleDriveModule, UsersModule],
  controllers: [ApprovalRequestsController],
  providers: [ApprovalRequestsService],
})
export class ApprovalRequestsModule {}
