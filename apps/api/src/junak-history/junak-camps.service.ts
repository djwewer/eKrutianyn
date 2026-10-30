import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, JunakCamp } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HistoryJunak, loadJunakForWrite } from './junak-history-access';
import { assertYearRange, requireText } from './history-input.util';
import { JunakCampView, toCampView } from './junak-history.views';
import { CreateCampDto } from './dto/create-camp.dto';
import { UpdateCampDto } from './dto/update-camp.dto';

@Injectable()
export class JunakCampsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(junakId: string, dto: CreateCampDto, actor: CurrentUserPayload): Promise<JunakCampView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const name = requireText(dto.name, 'Вкажіть назву табору');
    const yearTo = dto.yearTo ?? null;
    assertYearRange(dto.yearFrom, yearTo);
    const row = await this.prisma.junakCamp.create({
      data: { junakId, name, yearFrom: dto.yearFrom, yearTo, role: dto.role, createdById: actor.userId },
    });
    await this.record(AuditAction.CAMP_ADDED, junak, row, actor);
    return toCampView(row);
  }

  async update(junakId: string, id: string, dto: UpdateCampDto, actor: CurrentUserPayload): Promise<JunakCampView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const existing = await this.findOwnedOrThrow(junakId, id);
    // @IsOptional lets null through: yearFrom and role cannot be cleared.
    if (dto.yearFrom === null || dto.role === null) {
      throw new BadRequestException('Рік початку і роль не можна очищувати');
    }
    const yearFrom = dto.yearFrom ?? existing.yearFrom;
    const yearTo = dto.yearTo === undefined ? existing.yearTo : dto.yearTo;
    assertYearRange(yearFrom, yearTo);
    const row = await this.prisma.junakCamp.update({
      where: { id },
      data: {
        name: dto.name === undefined ? undefined : requireText(dto.name, 'Вкажіть назву табору'),
        yearFrom,
        yearTo,
        role: dto.role,
      },
    });
    await this.record(AuditAction.CAMP_UPDATED, junak, row, actor);
    return toCampView(row);
  }

  async remove(junakId: string, id: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    await this.prisma.junakCamp.delete({ where: { id } });
    await this.record(AuditAction.CAMP_REMOVED, junak, row, actor);
    return { success: true };
  }

  private async findOwnedOrThrow(junakId: string, id: string) {
    const row = await this.prisma.junakCamp.findUnique({ where: { id } });
    if (!row || row.junakId !== junakId) {
      throw new NotFoundException('Запис не знайдено');
    }
    return row;
  }

  private record(action: AuditAction, junak: HistoryJunak, row: JunakCamp, actor: CurrentUserPayload) {
    return this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action,
      subjectUserId: junak.id,
      entityId: row.id,
      details: { subjectName: personLabel(junak), campName: row.name, yearFrom: row.yearFrom, yearTo: row.yearTo, role: row.role },
    });
  }
}
