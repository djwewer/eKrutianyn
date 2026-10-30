import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { loadJunakForWrite } from './junak-history-access';
import { patchHistoryDate } from './history-input.util';
import { HistoryDatesView, isoDate } from './junak-history.views';
import { UpdateHistoryDatesDto } from './dto/update-history-dates.dto';

@Injectable()
export class JunakHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
        ...(dto.upyJoinedAt !== undefined ? { upyJoinedAt: dto.upyJoinedAt } : {}),
        ...(dto.plastOathAt !== undefined ? { plastOathAt: dto.plastOathAt } : {}),
      },
    });
    return { upyJoinedAt: isoDate(updated.upyJoinedAt), plastOathAt: isoDate(updated.plastOathAt) };
  }
}
