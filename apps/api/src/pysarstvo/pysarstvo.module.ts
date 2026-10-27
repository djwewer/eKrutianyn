import { Module } from '@nestjs/common';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { PysarstvoController } from './pysarstvo.controller';
import { PysarstvoService } from './pysarstvo.service';

@Module({
  imports: [GoogleDriveModule],
  controllers: [PysarstvoController],
  providers: [PysarstvoService],
})
export class PysarstvoModule {}
