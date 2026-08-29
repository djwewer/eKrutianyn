import { Injectable, NotFoundException } from '@nestjs/common';
import { ProgressAction, ProgressStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PROBY_TRACKING_ROLES } from '../common/proby-tracking-roles';

@Injectable()
export class KurinsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(kurinId: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    return kurin;
  }

  async changeProbyProgram(kurinId: string, newProgramId: string, actorId: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) throw new NotFoundException('Kurin not found');

    const newProgram = await this.prisma.probyProgram.findUnique({ where: { id: newProgramId } });
    if (!newProgram) throw new NotFoundException('Proby program not found');

    if (kurin.probyProgramId === newProgramId) {
      return kurin;
    }

    const oldProgramId = kurin.probyProgramId;
    const junaky = await this.prisma.user.findMany({
      where: { kurinId, role: { in: [...PROBY_TRACKING_ROLES] } },
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

        const existingTarget = await this.prisma.junakProgress.findUnique({
          where: { junakId_pointId: { junakId: junak.id, pointId: targetPointId } },
        });

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

        if (!existingTarget) {
          await this.prisma.progressAuditLog.create({
            data: {
              junakId: junak.id,
              pointId: targetPointId,
              action: ProgressAction.CONFIRM,
              actorId,
            },
          });
        }
      }
    }

    return this.prisma.kurin.update({
      where: { id: kurinId },
      data: { probyProgramId: newProgramId },
    });
  }
}
