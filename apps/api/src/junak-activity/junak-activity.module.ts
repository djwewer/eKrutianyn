import { Module } from '@nestjs/common';
import { JunakActivityController } from './junak-activity.controller';
import { JunakActivityService } from './junak-activity.service';

@Module({
  controllers: [JunakActivityController],
  providers: [JunakActivityService],
})
export class JunakActivityModule {}
