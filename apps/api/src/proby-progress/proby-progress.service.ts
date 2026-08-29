import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProgressAction, ProgressStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class ProbyProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async getProgressFor(junakId: string, actor: CurrentUserPayload) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }

    if (actor.role === Role.JUNAK && actor.userId !== junakId) {
      throw new ForbiddenException("Cannot view another junak's progress");
    }

    if (actor.role === Role.KURINNYI) {
      throw new ForbiddenException('Kurinnyi cannot view proby progress');
    }

    if (actor.role === Role.VYKHOVNYK) {
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId: junak.hurtokId ?? undefined },
      });
      if (!assigned) {
        throw new ForbiddenException("Not assigned to this junak's hurtok");
      }
    }

    return this.prisma.junakProgress.findMany({
      where: { junakId },
      include: { point: true },
    });
  }

  async confirm(junakId: string, pointId: string, actor: CurrentUserPayload) {
    await this.assertAssignedVykhovnyk(junakId, actor);
    const progress = await this.prisma.junakProgress.upsert({
      where: { junakId_pointId: { junakId, pointId } },
      update: { status: ProgressStatus.DONE, confirmedById: actor.userId, confirmedAt: new Date() },
      create: {
        junakId,
        pointId,
        status: ProgressStatus.DONE,
        confirmedById: actor.userId,
        confirmedAt: new Date(),
      },
    });
    await this.prisma.progressAuditLog.create({
      data: { junakId, pointId, action: ProgressAction.CONFIRM, actorId: actor.userId },
    });
    return progress;
  }

  private async assertAssignedVykhovnyk(junakId: string, actor: CurrentUserPayload) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }
    const assigned = await this.prisma.vykhovnykHurtok.findFirst({
      where: { vykhovnykId: actor.userId, hurtokId: junak.hurtokId ?? undefined },
    });
    if (!assigned) {
      throw new ForbiddenException("Not assigned to this junak's hurtok");
    }
    return junak;
  }
}
