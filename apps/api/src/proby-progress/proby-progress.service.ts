import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

    if (actor.isKurinniy && actor.userId !== junakId) {
      throw new ForbiddenException("Kurinnyi cannot view another user's proby progress");
    }

    if (actor.role === Role.VYKHOVNYK) {
      if (!junak.hurtokId) {
        throw new ForbiddenException("Not assigned to this junak's hurtok");
      }
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId: junak.hurtokId ?? undefined },
      });
      if (!assigned) {
        throw new ForbiddenException("Not assigned to this junak's hurtok");
      }
    }

    const points = await this.prisma.junakProgress.findMany({
      where: { junakId },
      include: { point: true },
    });

    const kurin = await this.prisma.kurin.findUnique({ where: { id: junak.kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    const statuses = await this.getStageStatuses(junakId, kurin.probyProgramId);
    const stages = Array.from(statuses.entries()).map(([stageId, info]) => ({
      stageId,
      status: info.status,
      hasDebt: info.hasDebt,
    }));

    return { points, stages };
  }

  async confirm(junakId: string, pointId: string, actor: CurrentUserPayload) {
    await this.assertCanConfirm(junakId, actor);
    await this.assertPointExists(pointId);
    await this.assertStageIsOpenForPoint(junakId, pointId);
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

  async unconfirm(junakId: string, pointId: string, actor: CurrentUserPayload) {
    await this.assertCanConfirm(junakId, actor);
    await this.assertPointExists(pointId);
    await this.assertStageIsOpenForPoint(junakId, pointId);
    const progress = await this.prisma.junakProgress.upsert({
      where: { junakId_pointId: { junakId, pointId } },
      update: { status: ProgressStatus.NOT_DONE, confirmedById: null, confirmedAt: null },
      create: { junakId, pointId, status: ProgressStatus.NOT_DONE },
    });
    await this.prisma.progressAuditLog.create({
      data: { junakId, pointId, action: ProgressAction.UNCONFIRM, actorId: actor.userId },
    });
    return progress;
  }

  async closeStage(junakId: string, stageId: string, actor: CurrentUserPayload) {
    const junak = await this.assertCanConfirm(junakId, actor);
    const kurin = await this.prisma.kurin.findUnique({ where: { id: junak.kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    const stage = await this.prisma.probyStage.findUnique({ where: { id: stageId } });
    if (!stage || stage.programId !== kurin.probyProgramId) {
      throw new NotFoundException('Stage not found');
    }
    const statuses = await this.getStageStatuses(junakId, stage.programId);
    if (statuses.get(stageId)?.status === 'LOCKED') {
      throw new BadRequestException('Cannot close a locked stage');
    }

    return this.prisma.junakStageProgress.upsert({
      where: { junakId_stageId: { junakId, stageId } },
      update: { closedAt: new Date(), closedById: actor.userId },
      create: {
        junakId,
        stageId,
        closedAt: new Date(),
        closedById: actor.userId,
        firstClosedAt: new Date(),
      },
    });
  }

  async reopenStage(junakId: string, stageId: string, actor: CurrentUserPayload) {
    const junak = await this.assertCanConfirm(junakId, actor);
    const kurin = await this.prisma.kurin.findUnique({ where: { id: junak.kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    const stage = await this.prisma.probyStage.findUnique({ where: { id: stageId } });
    if (!stage || stage.programId !== kurin.probyProgramId) {
      throw new NotFoundException('Stage not found');
    }
    const statuses = await this.getStageStatuses(junakId, stage.programId);
    if (statuses.get(stageId)?.status !== 'CLOSED') {
      throw new BadRequestException('Only a closed stage can be reopened');
    }

    return this.prisma.junakStageProgress.update({
      where: { junakId_stageId: { junakId, stageId } },
      data: { closedAt: null },
    });
  }

  private async getStageStatuses(
    junakId: string,
    programId: string,
  ): Promise<Map<string, { status: 'LOCKED' | 'OPEN' | 'CLOSED'; hasDebt: boolean }>> {
    const stages = await this.prisma.probyStage.findMany({
      where: { programId },
      orderBy: { order: 'asc' },
      include: { categories: { include: { points: { select: { id: true } } } } },
    });

    const stageProgressRows = await this.prisma.junakStageProgress.findMany({
      where: { junakId, stageId: { in: stages.map((s) => s.id) } },
    });
    const stageProgressByStageId = new Map(stageProgressRows.map((row) => [row.stageId, row]));

    const doneEntries = await this.prisma.junakProgress.findMany({
      where: {
        junakId,
        status: ProgressStatus.DONE,
        point: { category: { stage: { programId } } },
      },
      select: { point: { select: { category: { select: { stageId: true } } } } },
    });
    const doneCountByStageId = new Map<string, number>();
    for (const entry of doneEntries) {
      const stageId = entry.point.category.stageId;
      doneCountByStageId.set(stageId, (doneCountByStageId.get(stageId) ?? 0) + 1);
    }

    const statuses = new Map<string, { status: 'LOCKED' | 'OPEN' | 'CLOSED'; hasDebt: boolean }>();
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const previousStage = i > 0 ? stages[i - 1] : null;
      const previousStageProgress = previousStage ? stageProgressByStageId.get(previousStage.id) : undefined;
      const reachable = i === 0 || !!previousStageProgress?.firstClosedAt;

      if (!reachable) {
        statuses.set(stage.id, { status: 'LOCKED', hasDebt: false });
        continue;
      }

      const totalPoints = stage.categories.reduce((sum, category) => sum + category.points.length, 0);
      const doneCount = doneCountByStageId.get(stage.id) ?? 0;
      const allDone = doneCount === totalPoints;
      const thisStageProgress = stageProgressByStageId.get(stage.id);
      const closedNow = !!thisStageProgress?.closedAt;

      statuses.set(stage.id, {
        status: closedNow && allDone ? 'CLOSED' : 'OPEN',
        hasDebt: closedNow && !allDone,
      });
    }

    return statuses;
  }

  private async assertStageIsOpenForPoint(junakId: string, pointId: string) {
    const point = await this.prisma.probyPoint.findUnique({
      where: { id: pointId },
      select: { category: { select: { stageId: true, stage: { select: { programId: true } } } } },
    });
    if (!point) {
      return;
    }
    const statuses = await this.getStageStatuses(junakId, point.category.stage.programId);
    if (statuses.get(point.category.stageId)?.status !== 'OPEN') {
      throw new ForbiddenException('This proba stage is locked or closed');
    }
  }

  private async assertPointExists(pointId: string) {
    const point = await this.prisma.probyPoint.findUnique({ where: { id: pointId } });
    if (!point) {
      throw new NotFoundException('Point not found');
    }
  }

  private async assertCanConfirm(junakId: string, actor: CurrentUserPayload) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found');
    }
    if (actor.role === Role.ZVYAZKOVYI) {
      return junak;
    }
    if (!junak.hurtokId) {
      throw new ForbiddenException("Not assigned to this junak's hurtok");
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
