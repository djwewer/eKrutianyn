import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { KurinsController } from './kurins.controller';
import { KurinsService } from './kurins.service';
import { KurinGoogleDriveController } from './kurin-google-drive.controller';
import { KurinJunakImportController } from './kurin-junak-import.controller';
import { JudgeBookSyncService } from './judge-book-sync.service';
import { JudgeBookSyncCron } from './judge-book-sync.cron';

@Module({
  imports: [AuthModule, GoogleDriveModule],
  controllers: [KurinsController, KurinGoogleDriveController, KurinJunakImportController],
  providers: [KurinsService, JudgeBookSyncService, JudgeBookSyncCron],
  exports: [JudgeBookSyncService],
})
export class KurinsModule {}
