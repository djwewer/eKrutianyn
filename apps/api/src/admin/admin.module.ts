import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { KurinsAdminController } from './kurins-admin.controller';
import { KurinsAdminService } from './kurins-admin.service';
import { ProbyCatalogAdminController } from './proby-catalog-admin.controller';
import { ProbyCatalogAdminService } from './proby-catalog-admin.service';
import { PointMappingAdminController } from './point-mapping-admin.controller';
import { PointMappingAdminService } from './point-mapping-admin.service';
import { TestMailAdminController } from './test-mail-admin.controller';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [KurinsAdminController, ProbyCatalogAdminController, PointMappingAdminController, TestMailAdminController],
  providers: [KurinsAdminService, ProbyCatalogAdminService, PointMappingAdminService],
})
export class AdminModule {}
