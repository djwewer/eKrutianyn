import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { ProbyCatalogAdminService } from './proby-catalog-admin.service';
import { CreateProbyProgramDto } from './dto/create-proby-program.dto';
import { CreateProbyStageDto } from './dto/create-proby-stage.dto';
import { CreateProbyCategoryDto } from './dto/create-proby-category.dto';
import { CreateProbyPointDto } from './dto/create-proby-point.dto';

@UseGuards(AdminKeyGuard)
@Controller('admin')
export class ProbyCatalogAdminController {
  constructor(private readonly service: ProbyCatalogAdminService) {}

  @Post('proby-programs')
  createProgram(@Body() dto: CreateProbyProgramDto) {
    return this.service.createProgram(dto);
  }

  @Post('proby-programs/:programId/stages')
  createStage(@Param('programId') programId: string, @Body() dto: CreateProbyStageDto) {
    return this.service.createStage(programId, dto);
  }

  @Post('proby-stages/:stageId/categories')
  createCategory(@Param('stageId') stageId: string, @Body() dto: CreateProbyCategoryDto) {
    return this.service.createCategory(stageId, dto);
  }

  @Post('proby-categories/:categoryId/points')
  createPoint(@Param('categoryId') categoryId: string, @Body() dto: CreateProbyPointDto) {
    return this.service.createPoint(categoryId, dto);
  }
}
