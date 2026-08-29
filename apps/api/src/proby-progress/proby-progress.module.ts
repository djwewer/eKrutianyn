import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProbyProgressController } from './proby-progress.controller';
import { ProbyProgressService } from './proby-progress.service';

@Module({
  imports: [AuthModule],
  controllers: [ProbyProgressController],
  providers: [ProbyProgressService],
})
export class ProbyProgressModule {}
