import { Module } from '@nestjs/common';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [GoogleDriveModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
