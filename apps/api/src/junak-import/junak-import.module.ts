import { Module } from '@nestjs/common';
import { HurtkyModule } from '../hurtky/hurtky.module';
import { JunakImportRowProcessorService } from './junak-import-row-processor.service';

@Module({
  imports: [HurtkyModule],
  providers: [JunakImportRowProcessorService],
  exports: [JunakImportRowProcessorService],
})
export class JunakImportModule {}
