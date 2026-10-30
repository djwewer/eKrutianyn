import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { UsersService } from '../users/users.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { canWriteJunakHistory, loadJunakForRead, loadJunakForWrite } from './junak-history-access';
import { patchHistoryDate } from './history-input.util';
import {
  HistoryDatesView,
  JUNAK_SKILL_INCLUDE,
  JunakHistoryView,
  isoDate,
  toCampView,
  toJunakSkillView,
  toPastPositionView,
  toRemarkView,
  toVfvView,
} from './junak-history.views';
import { UpdateHistoryDatesDto } from './dto/update-history-dates.dto';

@Injectable()
export class JunakHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
  ) {}

  async get(junakId: string, actor: CurrentUserPayload): Promise<JunakHistoryView> {
    const junak = await loadJunakForRead(this.usersService, junakId, actor);
    const [dates, skills, vfv, camps, remarks, pastPositions, positions] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: junakId }, select: { upyJoinedAt: true, plastOathAt: true } }),
      this.prisma.junakSkill.findMany({
        where: { junakId },
        include: JUNAK_SKILL_INCLUDE,
        orderBy: [{ achievedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.junakVfv.findMany({
        where: { junakId },
        orderBy: [{ achievedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      }),
      this.prisma.junakCamp.findMany({ where: { junakId }, orderBy: [{ yearFrom: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.junakRemark.findMany({ where: { junakId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.junakPastPosition.findMany({ where: { junakId }, orderBy: [{ yearFrom: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.kurinPosition.findMany({
        where: { userId: junakId, kurinId: junak.kurinId },
        include: { hurtok: { select: { name: true } } },
        orderBy: { assignedAt: 'desc' },
      }),
    ]);
    return {
      canEdit: await canWriteJunakHistory(this.prisma, junak, actor),
      upyJoinedAt: isoDate(dates.upyJoinedAt),
      plastOathAt: isoDate(dates.plastOathAt),
      skills: skills.map(toJunakSkillView),
      vfv: vfv.map(toVfvView),
      camps: camps.map(toCampView),
      remarks: remarks.map(toRemarkView),
      pastPositions: pastPositions.map(toPastPositionView),
      positions: positions.map((p) => ({
        id: p.id,
        positionType: p.positionType,
        scope: p.scope,
        hurtokName: p.hurtok?.name ?? null,
        assignedAt: p.assignedAt.toISOString(),
        removedAt: p.removedAt ? p.removedAt.toISOString() : null,
      })),
    };
  }

  async updateDates(junakId: string, dto: UpdateHistoryDatesDto, actor: CurrentUserPayload): Promise<HistoryDatesView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    if (dto.upyJoinedAt === undefined && dto.plastOathAt === undefined) {
      throw new BadRequestException('Немає що змінювати');
    }
    const updated = await this.prisma.user.update({
      where: { id: junakId },
      data: { upyJoinedAt: patchHistoryDate(dto.upyJoinedAt), plastOathAt: patchHistoryDate(dto.plastOathAt) },
      select: { upyJoinedAt: true, plastOathAt: true },
    });
    await this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action: AuditAction.HISTORY_DATES_CHANGED,
      subjectUserId: junak.id,
      details: {
        subjectName: personLabel(junak),
        ...(dto.upyJoinedAt !== undefined ? { upyJoinedAt: isoDate(updated.upyJoinedAt) } : {}),
        ...(dto.plastOathAt !== undefined ? { plastOathAt: isoDate(updated.plastOathAt) } : {}),
      },
    });
    return { upyJoinedAt: isoDate(updated.upyJoinedAt), plastOathAt: isoDate(updated.plastOathAt) };
  }
}
