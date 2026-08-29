import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KurinsAdminController } from './kurins-admin.controller';
import { KurinsAdminService } from './kurins-admin.service';
import { ProbyCatalogAdminController } from './proby-catalog-admin.controller';
import { ProbyCatalogAdminService } from './proby-catalog-admin.service';

@Module({
  imports: [AuthModule],
  controllers: [KurinsAdminController, ProbyCatalogAdminController],
  providers: [KurinsAdminService, ProbyCatalogAdminService],
})
export class AdminModule {}
