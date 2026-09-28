import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { KurinsController } from './kurins.controller';
import { KurinsService } from './kurins.service';
import { KurinGoogleDriveController } from './kurin-google-drive.controller';
import { KurinJunakImportController } from './kurin-junak-import.controller';

@Module({
  imports: [AuthModule, GoogleDriveModule],
  controllers: [KurinsController, KurinGoogleDriveController, KurinJunakImportController],
  providers: [KurinsService],
})
export class KurinsModule {}
