import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KurinPositionsController } from './kurin-positions.controller';
import { KurinPositionsService } from './kurin-positions.service';

@Module({
  imports: [AuthModule],
  controllers: [KurinPositionsController],
  providers: [KurinPositionsService],
})
export class KurinPositionsModule {}
