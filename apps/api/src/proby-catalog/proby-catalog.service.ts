import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProbyCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentForKurin(kurinId: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }

    const program = await this.prisma.probyProgram.findUnique({
      where: { id: kurin.probyProgramId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            categories: {
              include: {
                points: { orderBy: { order: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!program) {
      throw new NotFoundException('Proby program not found');
    }
    return program;
  }
}
