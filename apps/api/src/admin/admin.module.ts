import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KurinsAdminController } from './kurins-admin.controller';
import { KurinsAdminService } from './kurins-admin.service';

@Module({
  imports: [AuthModule],
  controllers: [KurinsAdminController],
  providers: [KurinsAdminService],
})
export class AdminModule {}
