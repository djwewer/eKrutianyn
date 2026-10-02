import { Injectable } from '@nestjs/common';
import { PositionScope, PositionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HurtkyService } from '../hurtky/hurtky.service';
import { KurinPositionsService } from '../kurin-positions/kurin-positions.service';
import { ProbyProgressService } from '../proby-progress/proby-progress.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ResolvedJunakRow, JunakImportRowResult } from './junak-import-row.types';
import { isKurinniyForUser } from '../common/kurinniy.util';
import { getActiveKurinPositions } from '../common/positions.util';
import { DEGREE_STAGE_PREFIXES } from '../common/degree-stages.util';

export interface ProcessRowOptions {
  restrictProtectedTargets?: boolean;
}

@Injectable()
export class JunakImportRowProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hurtky: HurtkyService,
    private readonly kurinPositions: KurinPositionsService,
    private readonly probyProgress: ProbyProgressService,
  ) {}

  async processRow(
    kurinId: string,
    row: ResolvedJunakRow,
    rowIndex: number,
    actor: CurrentUserPayload,
    options: ProcessRowOptions = {},
  ): Promise<JunakImportRowResult> {
    const result: JunakImportRowResult = { row: rowIndex, succeededSteps: [] };
    try {
      const { junakId, hurtokId } = await this.upsertUserHurtokContacts(kurinId, row, rowIndex, result, options);
      result.junakId = junakId;

      await this.assignPositions(kurinId, junakId, hurtokId, row, actor, result);
      await this.backfillProbaProgress(kurinId, junakId, row, actor, result);
    } catch (error) {
      result.error = (error as Error).message;
    }
    return result;
  }

  private async upsertUserHurtokContacts(
    kurinId: string,
    row: ResolvedJunakRow,
    rowIndex: number,
    result: JunakImportRowResult,
    options: ProcessRowOptions,
  ): Promise<{ junakId: string; hurtokId?: string }> {
    let hurtokId: string | undefined;
    if (row.hurtokName) {
      const existing = await this.hurtky.listForKurin(kurinId);
      const match = existing.find((h) => h.name === row.hurtokName);
      hurtokId = match ? match.id : (await this.hurtky.create({ name: row.hurtokName, number: undefined }, kurinId)).id;
      result.succeededSteps.push('hurtok');
    }

    const junakId = await this.prisma.$transaction(async (tx) => {
      let userId: string;
      if (row.matchedUserId) {
        const target = await tx.user.findUnique({ where: { id: row.matchedUserId } });
        if (!target || target.role !== Role.JUNAK || target.kurinId !== kurinId) {
          throw new Error('Юнак для оновлення не знайдений у цьому курені');
        }
        if (options.restrictProtectedTargets) {
          const [targetIsKurinniy, targetPositions] = await Promise.all([
            isKurinniyForUser(this.prisma, target.id),
            getActiveKurinPositions(this.prisma, target.id, kurinId),
          ]);
          if (targetIsKurinniy || targetPositions.length > 0) {
            throw new Error(
              'Не можна оновлювати дані курінного або посадової особи через запит на затвердження — це може зробити лише звʼязковий напряму',
            );
          }
        }
        const updateData: Record<string, unknown> = {};
        if (row.firstName) updateData.firstName = row.firstName;
        if (row.lastName) updateData.lastName = row.lastName;
        if (row.nickname) updateData.nickname = row.nickname;
        if (row.birthDate) updateData.birthDate = new Date(row.birthDate);
        if (row.email && !target.email) updateData.email = row.email;
        if (row.phone && !target.phone) updateData.phone = row.phone;
        if (hurtokId) updateData.hurtokId = hurtokId;
        updateData.judgeBookRowNumber = rowIndex + 2;
        const updated = await tx.user.update({ where: { id: row.matchedUserId }, data: updateData });
        userId = updated.id;
        result.created = false;
      } else {
        const created = await tx.user.create({
          data: {
            firstName: row.firstName,
            lastName: row.lastName,
            nickname: row.nickname,
            birthDate: row.birthDate ? new Date(row.birthDate) : undefined,
            email: row.email,
            phone: row.phone,
            role: Role.JUNAK,
            kurinId,
            hurtokId,
            judgeBookRowNumber: rowIndex + 2,
          },
        });
        userId = created.id;
        result.created = true;
      }

      for (const guardian of row.guardians ?? []) {
        const existingContact = await tx.guardianContact.findFirst({ where: { junakId: userId, name: guardian.name } });
        if (existingContact) {
          await tx.guardianContact.update({
            where: { id: existingContact.id },
            data: { phone: guardian.phone, email: guardian.email },
          });
        } else {
          await tx.guardianContact.create({
            data: { junakId: userId, name: guardian.name, phone: guardian.phone ?? '', email: guardian.email },
          });
        }
      }
      if ((row.guardians ?? []).length > 0) {
        result.succeededSteps.push('contacts');
      }

      return userId;
    });

    result.succeededSteps.push('user');
    return { junakId, hurtokId };
  }

  private async assignPositions(
    kurinId: string,
    junakId: string,
    hurtokId: string | undefined,
    row: ResolvedJunakRow,
    actor: CurrentUserPayload,
    result: JunakImportRowResult,
  ): Promise<void> {
    for (const positionType of row.kurinPositionTypes ?? []) {
      if (positionType === PositionType.KURINNYI) {
        throw new Error('Посаду "Курінний" не можна призначити через імпорт з Книги судді');
      }
      await this.kurinPositions.assign(
        { userId: junakId, scope: PositionScope.KURIN, positionType, hurtokId: undefined },
        actor,
      );
    }
    for (const positionType of row.hurtokPositionTypes ?? []) {
      if (!hurtokId) continue;
      await this.kurinPositions.assign(
        { userId: junakId, scope: PositionScope.HURTOK, positionType, hurtokId },
        actor,
      );
    }
    if ((row.kurinPositionTypes ?? []).length > 0 || (row.hurtokPositionTypes ?? []).length > 0) {
      result.succeededSteps.push('positions');
    }
    void kurinId;
  }

  private async backfillProbaProgress(
    kurinId: string,
    junakId: string,
    row: ResolvedJunakRow,
    actor: CurrentUserPayload,
    result: JunakImportRowResult,
  ): Promise<void> {
    if (!row.degreeDates) return;
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) return;
    const stages = await this.prisma.probyStage.findMany({
      where: { programId: kurin.probyProgramId },
      orderBy: { order: 'asc' },
      include: { categories: { include: { points: { select: { id: true } } } } },
    });

    let touchedAny = false;
    for (const { key, prefix } of DEGREE_STAGE_PREFIXES) {
      const date = row.degreeDates[key];
      if (!date) continue;
      const stage = stages.find((s) => s.name.startsWith(prefix));
      if (!stage) continue;

      const progress = await this.probyProgress.getProgressFor(junakId, actor);
      const currentStatus = progress.stages.find((s: { stageId: string }) => s.stageId === stage.id)?.status;
      if (currentStatus === 'CLOSED') continue;

      const pointIds = stage.categories.flatMap((c: { points: { id: string }[] }) => c.points.map((p) => p.id));
      for (const pointId of pointIds) {
        await this.probyProgress.confirm(junakId, pointId, actor);
      }
      await this.probyProgress.closeStage(junakId, stage.id, actor);
      touchedAny = true;
    }
    if (touchedAny) {
      result.succeededSteps.push('proba-progress');
    }
  }
}
