import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { JunakSkillsController } from './junak-skills.controller';
import { JunakSkillsService } from './junak-skills.service';
import { JunakVfvController } from './junak-vfv.controller';
import { JunakVfvService } from './junak-vfv.service';
import { JunakCampsController } from './junak-camps.controller';
import { JunakCampsService } from './junak-camps.service';

@Module({
  imports: [UsersModule],
  controllers: [JunakSkillsController, JunakVfvController, JunakCampsController],
  providers: [JunakSkillsService, JunakVfvService, JunakCampsService],
})
export class JunakHistoryModule {}
