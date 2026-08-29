import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KurinsController } from './kurins.controller';
import { KurinsService } from './kurins.service';

@Module({
  imports: [AuthModule],
  controllers: [KurinsController],
  providers: [KurinsService],
})
export class KurinsModule {}
