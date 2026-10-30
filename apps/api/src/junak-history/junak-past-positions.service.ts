import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, JunakPastPosition } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HistoryJunak, loadJunakForWrite } from './junak-history-access';
import { assertYearRange, requireText } from './history-input.util';
import { JunakPastPositionView, toPastPositionView } from './junak-history.views';
import { CreatePastPositionDto } from './dto/create-past-position.dto';
import { UpdatePastPositionDto } from './dto/update-past-position.dto';

const TITLE_REQUIRED = 'Вкажіть назву посади';

@Injectable()
export class JunakPastPositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(junakId: string, dto: CreatePastPositionDto, actor: CurrentUserPayload): Promise<JunakPastPositionView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const title = requireText(dto.title, TITLE_REQUIRED);
    const yearTo = dto.yearTo ?? null;
    assertYearRange(dto.yearFrom, yearTo);
    const row = await this.prisma.junakPastPosition.create({
      data: { junakId, title, scope: dto.scope, yearFrom: dto.yearFrom, yearTo, createdById: actor.userId },
    });
    await this.record(AuditAction.PAST_POSITION_ADDED, junak, row, actor);
    return toPastPositionView(row);
  }

  async update(junakId: string, id: string, dto: UpdatePastPositionDto, actor: CurrentUserPayload): Promise<JunakPastPositionView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const existing = await this.findOwnedOrThrow(junakId, id);
    // @IsOptional lets null through: title, scope and yearFrom cannot be cleared.
    if (dto.title === null || dto.scope === null || dto.yearFrom === null) {
      throw new BadRequestException('Назву, тип і рік початку не можна очищувати');
    }
    const yearFrom = dto.yearFrom ?? existing.yearFrom;
    const yearTo = dto.yearTo === undefined ? existing.yearTo : dto.yearTo;
    assertYearRange(yearFrom, yearTo);
    const row = await this.prisma.junakPastPosition.update({
      where: { id },
      data: {
        title: dto.title === undefined ? undefined : requireText(dto.title, TITLE_REQUIRED),
        scope: dto.scope,
        yearFrom,
        yearTo,
      },
    });
    await this.record(AuditAction.PAST_POSITION_UPDATED, junak, row, actor);
    return toPastPositionView(row);
  }

  async remove(junakId: string, id: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    await this.prisma.junakPastPosition.delete({ where: { id } });
    await this.record(AuditAction.PAST_POSITION_REMOVED, junak, row, actor);
    return { success: true };
  }

  private async findOwnedOrThrow(junakId: string, id: string) {
    const row = await this.prisma.junakPastPosition.findUnique({ where: { id } });
    if (!row || row.junakId !== junakId) {
      throw new NotFoundException('Запис не знайдено');
    }
    return row;
  }

  private record(action: AuditAction, junak: HistoryJunak, row: JunakPastPosition, actor: CurrentUserPayload) {
    return this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action,
      subjectUserId: junak.id,
      entityId: row.id,
      details: { subjectName: personLabel(junak), title: row.title, scope: row.scope, yearFrom: row.yearFrom, yearTo: row.yearTo },
    });
  }
}
