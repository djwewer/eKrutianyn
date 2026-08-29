import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProbyProgramDto } from './dto/create-proby-program.dto';
import { CreateProbyStageDto } from './dto/create-proby-stage.dto';
import { CreateProbyCategoryDto } from './dto/create-proby-category.dto';
import { CreateProbyPointDto } from './dto/create-proby-point.dto';

@Injectable()
export class ProbyCatalogAdminService {
  constructor(private readonly prisma: PrismaService) {}

  createProgram(dto: CreateProbyProgramDto) {
    return this.prisma.probyProgram.create({ data: dto });
  }

  async createStage(programId: string, dto: CreateProbyStageDto) {
    const program = await this.prisma.probyProgram.findUnique({ where: { id: programId } });
    if (!program) throw new NotFoundException('Proby program not found');
    return this.prisma.probyStage.create({ data: { ...dto, programId } });
  }

  async createCategory(stageId: string, dto: CreateProbyCategoryDto) {
    const stage = await this.prisma.probyStage.findUnique({ where: { id: stageId } });
    if (!stage) throw new NotFoundException('Proby stage not found');
    return this.prisma.probyCategory.create({ data: { ...dto, stageId } });
  }

  async createPoint(categoryId: string, dto: CreateProbyPointDto) {
    const category = await this.prisma.probyCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Proby category not found');
    return this.prisma.probyPoint.create({ data: { ...dto, categoryId } });
  }
}
