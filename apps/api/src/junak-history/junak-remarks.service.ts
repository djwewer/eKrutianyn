import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, JunakRemark, JunakRemarkKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HistoryJunak, loadJunakForWrite } from './junak-history-access';
import { blankToNull, parseHistoryDate, requireText } from './history-input.util';
import { JunakRemarkView, isoDate, toRemarkView } from './junak-history.views';
import { CreateRemarkDto } from './dto/create-remark.dto';
import { UpdateRemarkDto } from './dto/update-remark.dto';

const TEXT_REQUIRED = 'Опишіть, за що';
const HOW_TO_FIX_REQUIRED = 'Для перестороги обовʼязково вкажіть, як її виправити';
const AWARD_HAS_NO_FIX = 'Для відзначення поле «Як виправити» не заповнюється';

@Injectable()
export class JunakRemarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(junakId: string, dto: CreateRemarkDto, actor: CurrentUserPayload): Promise<JunakRemarkView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const text = requireText(dto.text, TEXT_REQUIRED);
    let howToFix: string | null = null;
    if (dto.kind === JunakRemarkKind.WARNING) {
      howToFix = requireText(dto.howToFix, HOW_TO_FIX_REQUIRED);
    } else if (blankToNull(dto.howToFix)) {
      throw new BadRequestException(AWARD_HAS_NO_FIX);
    }
    const row = await this.prisma.junakRemark.create({
      data: { junakId, kind: dto.kind, text, howToFix, date: parseHistoryDate(dto.date), createdById: actor.userId },
    });
    await this.record(AuditAction.REMARK_ADDED, junak, row, actor);
    return toRemarkView(row);
  }

  async update(junakId: string, id: string, dto: UpdateRemarkDto, actor: CurrentUserPayload): Promise<JunakRemarkView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const existing = await this.findOwnedOrThrow(junakId, id);
    // @IsOptional lets null through: text and date are required and cannot be cleared.
    if (dto.text === null || dto.date === null) {
      throw new BadRequestException('«За що» і дату не можна очищувати');
    }
    const data: Prisma.JunakRemarkUpdateInput = {};
    if (dto.text !== undefined) data.text = requireText(dto.text, TEXT_REQUIRED);
    if (existing.kind === JunakRemarkKind.WARNING) {
      // Validate the merged result: a warning always keeps a non-blank howToFix.
      if (dto.howToFix !== undefined) data.howToFix = requireText(dto.howToFix, HOW_TO_FIX_REQUIRED);
    } else if (blankToNull(dto.howToFix)) {
      throw new BadRequestException(AWARD_HAS_NO_FIX);
    }
    if (dto.date !== undefined) data.date = parseHistoryDate(dto.date);
    const row = await this.prisma.junakRemark.update({ where: { id }, data });
    await this.record(AuditAction.REMARK_UPDATED, junak, row, actor);
    return toRemarkView(row);
  }

  async remove(junakId: string, id: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    await this.prisma.junakRemark.delete({ where: { id } });
    await this.record(AuditAction.REMARK_REMOVED, junak, row, actor);
    return { success: true };
  }

  private async findOwnedOrThrow(junakId: string, id: string) {
    const row = await this.prisma.junakRemark.findUnique({ where: { id } });
    if (!row || row.junakId !== junakId) {
      throw new NotFoundException('Запис не знайдено');
    }
    return row;
  }

  /** Only the fact, kind and date — never `text` or `howToFix` (sensitive text stays out of the journal). */
  private record(action: AuditAction, junak: HistoryJunak, row: JunakRemark, actor: CurrentUserPayload) {
    return this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action,
      subjectUserId: junak.id,
      entityId: row.id,
      details: { subjectName: personLabel(junak), kind: row.kind, date: isoDate(row.date) },
    });
  }
}
