import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProbyCatalogController } from './proby-catalog.controller';
import { ProbyCatalogService } from './proby-catalog.service';

@Module({
  imports: [AuthModule],
  controllers: [ProbyCatalogController],
  providers: [ProbyCatalogService],
})
export class ProbyCatalogModule {}
