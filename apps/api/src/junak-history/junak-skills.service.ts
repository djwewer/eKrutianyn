import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { UsersService } from '../users/users.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HistoryJunak, canWriteJunakHistory, loadJunakForRead, loadJunakForWrite } from './junak-history-access';
import { blankToNull, parseHistoryDate } from './history-input.util';
import { JUNAK_SKILL_INCLUDE, JunakSkillView, JunakSkillsView, toJunakSkillView } from './junak-history.views';
import { CreateJunakSkillDto } from './dto/create-junak-skill.dto';
import { UpdateJunakSkillDto } from './dto/update-junak-skill.dto';

@Injectable()
export class JunakSkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
  ) {}

  async list(junakId: string, actor: CurrentUserPayload): Promise<JunakSkillsView> {
    const junak = await loadJunakForRead(this.usersService, junakId, actor);
    const rows = await this.prisma.junakSkill.findMany({
      where: { junakId },
      include: JUNAK_SKILL_INCLUDE,
      orderBy: [{ achievedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return { canEdit: await canWriteJunakHistory(this.prisma, junak, actor), items: rows.map(toJunakSkillView) };
  }

  async create(junakId: string, dto: CreateJunakSkillDto, actor: CurrentUserPayload): Promise<JunakSkillView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const level = await this.prisma.skillLevel.findUnique({ where: { id: dto.levelId }, include: { skill: true } });
    if (!level || (level.skill.kurinId !== null && level.skill.kurinId !== actor.kurinId)) {
      throw new NotFoundException('Вмілість не знайдено');
    }
    const achievedAt = parseHistoryDate(dto.achievedAt);
    let row;
    try {
      row = await this.prisma.junakSkill.create({
        data: {
          junakId,
          levelId: level.id,
          achievedAt,
          examiner: blankToNull(dto.examiner) ?? null,
          certificateNumber: blankToNull(dto.certificateNumber) ?? null,
          createdById: actor.userId,
        },
        include: JUNAK_SKILL_INCLUDE,
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('Цей рівень вмілості юнакові вже зараховано');
      }
      throw err;
    }
    const view = toJunakSkillView(row);
    await this.record(AuditAction.SKILL_ACHIEVED, junak, view, actor);
    return view;
  }

  async update(junakId: string, id: string, dto: UpdateJunakSkillDto, actor: CurrentUserPayload): Promise<JunakSkillView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    await this.findOwnedOrThrow(junakId, id);
    if (dto.achievedAt === null) {
      throw new BadRequestException('Дата здобуття обовʼязкова');
    }
    const row = await this.prisma.junakSkill.update({
      where: { id },
      data: {
        achievedAt: dto.achievedAt != null ? parseHistoryDate(dto.achievedAt) : undefined,
        examiner: blankToNull(dto.examiner),
        certificateNumber: blankToNull(dto.certificateNumber),
      },
      include: JUNAK_SKILL_INCLUDE,
    });
    const view = toJunakSkillView(row);
    await this.record(AuditAction.SKILL_UPDATED, junak, view, actor);
    return view;
  }

  async remove(junakId: string, id: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    await this.prisma.junakSkill.delete({ where: { id } });
    await this.record(AuditAction.SKILL_REMOVED, junak, toJunakSkillView(row), actor);
    return { success: true };
  }

  private async findOwnedOrThrow(junakId: string, id: string) {
    const row = await this.prisma.junakSkill.findUnique({ where: { id }, include: JUNAK_SKILL_INCLUDE });
    if (!row || row.junakId !== junakId) {
      throw new NotFoundException('Запис не знайдено');
    }
    return row;
  }

  private record(action: AuditAction, junak: HistoryJunak, view: JunakSkillView, actor: CurrentUserPayload) {
    return this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action,
      subjectUserId: junak.id,
      entityId: view.id,
      details: { subjectName: personLabel(junak), skillName: view.skillName, level: view.level, achievedAt: view.achievedAt },
    });
  }
}
