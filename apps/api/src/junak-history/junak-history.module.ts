import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { JunakSkillsController } from './junak-skills.controller';
import { JunakSkillsService } from './junak-skills.service';

@Module({
  imports: [UsersModule],
  controllers: [JunakSkillsController],
  providers: [JunakSkillsService],
})
export class JunakHistoryModule {}
