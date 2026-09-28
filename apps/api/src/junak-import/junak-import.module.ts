import { Module } from '@nestjs/common';
import { HurtkyModule } from '../hurtky/hurtky.module';
import { KurinPositionsModule } from '../kurin-positions/kurin-positions.module';
import { ProbyProgressModule } from '../proby-progress/proby-progress.module';
import { JunakImportRowProcessorService } from './junak-import-row-processor.service';
import { JunakImportController } from './junak-import.controller';

@Module({
  imports: [HurtkyModule, KurinPositionsModule, ProbyProgressModule],
  controllers: [JunakImportController],
  providers: [JunakImportRowProcessorService],
  exports: [JunakImportRowProcessorService],
})
export class JunakImportModule {}
