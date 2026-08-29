import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HurtkyController } from './hurtky.controller';
import { HurtkyService } from './hurtky.service';

@Module({
  imports: [AuthModule],
  controllers: [HurtkyController],
  providers: [HurtkyService],
})
export class HurtkyModule {}
