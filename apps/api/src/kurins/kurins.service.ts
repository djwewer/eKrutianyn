import { Injectable, NotFoundException } from '@nestjs/common';
import { ProgressStatus, ProbyProgramVersion, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const KURIN_PUBLIC_SELECT = {
  id: true,
  name: true,
  kurinNumber: true,
  gender: true,
  stanytsia: true,
  probyProgram: { select: { version: true } },
} as const;

@Injectable()
export class KurinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(kurinId: string) {
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: KURIN_PUBLIC_SELECT,
    });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    return kurin;
  }

  async changeProbyProgram(kurinId: string, version: ProbyProgramVersion, actorId: string) {
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: { ...KURIN_PUBLIC_SELECT, probyProgramId: true },
    });
    if (!kurin) throw new NotFoundException('Kurin not found');

    const newProgram = await this.prisma.probyProgram.findFirst({ where: { version } });
    if (!newProgram) throw new NotFoundException('Proby program not found');

    if (kurin.probyProgramId === newProgram.id) {
      return kurin;
    }

    const oldProgramId = kurin.probyProgramId;
    const junaky = await this.prisma.user.findMany({
      where: { kurinId, role: Role.JUNAK },
      select: { id: true },
    });

    for (const junak of junaky) {
      const doneOldEntries = await this.prisma.junakProgress.findMany({
        where: {
          junakId: junak.id,
          status: ProgressStatus.DONE,
          point: { category: { stage: { programId: oldProgramId } } },
        },
      });

      for (const entry of doneOldEntries) {
        const mapping = await this.prisma.pointMapping.findFirst({
          where: {
            OR: [{ oldPointId: entry.pointId }, { newPointId: entry.pointId }],
          },
        });
        if (!mapping) continue;

        const targetPointId =
          mapping.oldPointId === entry.pointId ? mapping.newPointId : mapping.oldPointId;

        await this.prisma.junakProgress.upsert({
          where: { junakId_pointId: { junakId: junak.id, pointId: targetPointId } },
          update: {},
          create: {
            junakId: junak.id,
            pointId: targetPointId,
            status: ProgressStatus.DONE,
            confirmedById: entry.confirmedById,
            confirmedAt: entry.confirmedAt,
            transferredFromPointId: entry.pointId,
          },
        });
      }
    }

    return this.prisma.kurin.update({
      where: { id: kurinId },
      data: { probyProgramId: newProgram.id },
      select: KURIN_PUBLIC_SELECT,
    });
  }
}
