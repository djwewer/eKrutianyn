import { Module } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';
import { GOOGLE_DRIVE_CLIENT, createGoogleDriveClient } from './google-drive-client.provider';

@Module({
  providers: [{ provide: GOOGLE_DRIVE_CLIENT, useFactory: createGoogleDriveClient }, GoogleDriveService],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
