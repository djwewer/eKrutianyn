import { Module } from '@nestjs/common';
import { ReferenceSourceFetchService } from './reference-source-fetch.service';
import { ReferenceSourceFetchCron } from './reference-source-fetch.cron';

@Module({
  providers: [ReferenceSourceFetchService, ReferenceSourceFetchCron],
  exports: [ReferenceSourceFetchService],
})
export class ReferenceSourcesModule {}
