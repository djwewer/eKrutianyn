import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, JunakVfv } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HistoryJunak, loadJunakForWrite } from './junak-history-access';
import { blankToNull, patchHistoryDate } from './history-input.util';
import { JunakVfvView, isoDate, toVfvView } from './junak-history.views';
import { CreateVfvDto } from './dto/create-vfv.dto';
import { UpdateVfvDto } from './dto/update-vfv.dto';

@Injectable()
export class JunakVfvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(junakId: string, dto: CreateVfvDto, actor: CurrentUserPayload): Promise<JunakVfvView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.prisma.junakVfv.create({
      data: {
        junakId,
        achievedAt: patchHistoryDate(dto.achievedAt) ?? null,
        note: blankToNull(dto.note) ?? null,
        createdById: actor.userId,
      },
    });
    await this.record(AuditAction.VFV_ADDED, junak, row, actor);
    return toVfvView(row);
  }

  async update(junakId: string, id: string, dto: UpdateVfvDto, actor: CurrentUserPayload): Promise<JunakVfvView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    await this.findOwnedOrThrow(junakId, id);
    const row = await this.prisma.junakVfv.update({
      where: { id },
      data: { achievedAt: patchHistoryDate(dto.achievedAt), note: blankToNull(dto.note) },
    });
    await this.record(AuditAction.VFV_UPDATED, junak, row, actor);
    return toVfvView(row);
  }

  async remove(junakId: string, id: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    await this.prisma.junakVfv.delete({ where: { id } });
    await this.record(AuditAction.VFV_REMOVED, junak, row, actor);
    return { success: true };
  }

  private async findOwnedOrThrow(junakId: string, id: string) {
    const row = await this.prisma.junakVfv.findUnique({ where: { id } });
    if (!row || row.junakId !== junakId) {
      throw new NotFoundException('Запис не знайдено');
    }
    return row;
  }

  /** The note is free text — it stays out of the journal. */
  private record(action: AuditAction, junak: HistoryJunak, row: JunakVfv, actor: CurrentUserPayload) {
    return this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action,
      subjectUserId: junak.id,
      entityId: row.id,
      details: { subjectName: personLabel(junak), achievedAt: isoDate(row.achievedAt) },
    });
  }
}
