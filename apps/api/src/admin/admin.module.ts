import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { ReferenceSourcesModule } from '../reference-sources/reference-sources.module';
import { KurinsAdminController } from './kurins-admin.controller';
import { KurinsAdminService } from './kurins-admin.service';
import { ProbyCatalogAdminController } from './proby-catalog-admin.controller';
import { ProbyCatalogAdminService } from './proby-catalog-admin.service';
import { PointMappingAdminController } from './point-mapping-admin.controller';
import { PointMappingAdminService } from './point-mapping-admin.service';
import { TestMailAdminController } from './test-mail-admin.controller';
import { ReferenceSourceAdminController } from './reference-source-admin.controller';
import { ReferenceSourceAdminService } from './reference-source-admin.service';

@Module({
  imports: [AuthModule, MailModule, ReferenceSourcesModule],
  controllers: [
    KurinsAdminController,
    ProbyCatalogAdminController,
    PointMappingAdminController,
    TestMailAdminController,
    ReferenceSourceAdminController,
  ],
  providers: [KurinsAdminService, ProbyCatalogAdminService, PointMappingAdminService, ReferenceSourceAdminService],
})
export class AdminModule {}
