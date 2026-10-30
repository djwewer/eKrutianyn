import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { JunakSkillsController } from './junak-skills.controller';
import { JunakSkillsService } from './junak-skills.service';
import { JunakVfvController } from './junak-vfv.controller';
import { JunakVfvService } from './junak-vfv.service';
import { JunakCampsController } from './junak-camps.controller';
import { JunakCampsService } from './junak-camps.service';
import { JunakRemarksController } from './junak-remarks.controller';
import { JunakRemarksService } from './junak-remarks.service';
import { JunakPastPositionsController } from './junak-past-positions.controller';
import { JunakPastPositionsService } from './junak-past-positions.service';
import { JunakHistoryController } from './junak-history.controller';
import { JunakHistoryService } from './junak-history.service';

@Module({
  imports: [UsersModule],
  controllers: [
    JunakSkillsController,
    JunakVfvController,
    JunakCampsController,
    JunakRemarksController,
    JunakPastPositionsController,
    JunakHistoryController,
  ],
  providers: [
    JunakSkillsService,
    JunakVfvService,
    JunakCampsService,
    JunakRemarksService,
    JunakPastPositionsService,
    JunakHistoryService,
  ],
})
export class JunakHistoryModule {}
