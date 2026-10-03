import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { ProbyCatalogAdminService } from './proby-catalog-admin.service';
import { CreateProbyProgramDto } from './dto/create-proby-program.dto';
import { CreateProbyStageDto } from './dto/create-proby-stage.dto';
import { CreateProbyCategoryDto } from './dto/create-proby-category.dto';
import { CreateProbyPointDto } from './dto/create-proby-point.dto';
import { UpdateProbyPointReferenceDto } from './dto/update-proby-point-reference.dto';

@UseGuards(AdminKeyGuard)
@Controller('admin')
export class ProbyCatalogAdminController {
  constructor(private readonly service: ProbyCatalogAdminService) {}

  @Get('proby-programs')
  listPrograms() {
    return this.service.listPrograms();
  }

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

  @Patch('proby-points/:pointId/reference')
  updatePointReference(@Param('pointId') pointId: string, @Body() dto: UpdateProbyPointReferenceDto) {
    return this.service.updatePointReference(pointId, dto);
  }
}
