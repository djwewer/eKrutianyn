import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { UsersService } from '../users/users.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HistoryJunak, canWriteJunakHistory, loadJunakForRead, loadJunakForSelfOrWrite, loadJunakForWrite } from './junak-history-access';
import { blankToNull, parseHistoryDate } from './history-input.util';
import { JUNAK_SKILL_INCLUDE, JunakSkillView, JunakSkillsView, toJunakSkillView } from './junak-history.views';
import { CreateJunakSkillDto } from './dto/create-junak-skill.dto';
import { UpdateJunakSkillDto } from './dto/update-junak-skill.dto';
import { StartJunakSkillDto } from './dto/start-junak-skill.dto';
import { AchieveJunakSkillDto } from './dto/achieve-junak-skill.dto';
import { SkillRequirement } from '../skills/skill.types';

const DUPLICATE_MESSAGE = 'Цю вмілість уже розпочато або здобуто';

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
      orderBy: [{ achievedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
    });
    const canEdit = await canWriteJunakHistory(this.prisma, junak, actor);
    const canStart = canEdit || (actor.userId === junakId && !junak.archivedAt && junak.kurinId === actor.kurinId);
    return { canEdit, canStart, items: rows.map(toJunakSkillView) };
  }

  async start(junakId: string, dto: StartJunakSkillDto, actor: CurrentUserPayload): Promise<JunakSkillView> {
    const { junak } = await loadJunakForSelfOrWrite(this.prisma, junakId, actor);
    const level = await this.findLevelOrThrow(dto.levelId, actor);
    let row;
    try {
      row = await this.prisma.junakSkill.create({
        data: { junakId, levelId: level.id, achievedAt: null, startedAt: new Date(), startedById: actor.userId, createdById: actor.userId },
        include: JUNAK_SKILL_INCLUDE,
      });
    } catch (err: any) {
      if (err.code === 'P2002') throw new ConflictException(DUPLICATE_MESSAGE);
      throw err;
    }
    const view = toJunakSkillView(row);
    await this.record(AuditAction.SKILL_STARTED, junak, view, actor);
    return view;
  }

  async sign(junakId: string, id: string, index: string, actor: CurrentUserPayload): Promise<JunakSkillView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    const idx = this.parseIndex(index, row);
    if (!row.signs.some((s) => s.requirementIndex === idx)) {
      await this.prisma.junakSkillRequirementSign.upsert({
        where: { junakSkillId_requirementIndex: { junakSkillId: id, requirementIndex: idx } },
        create: { junakSkillId: id, requirementIndex: idx, signedById: actor.userId },
        update: {},
      });
      await this.record(AuditAction.SKILL_REQUIREMENT_SIGNED, junak, toJunakSkillView(row), actor, { requirementIndex: idx });
    }
    return toJunakSkillView(await this.findOwnedOrThrow(junakId, id));
  }

  async unsign(junakId: string, id: string, index: string, actor: CurrentUserPayload): Promise<JunakSkillView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    const idx = this.parseIndex(index, row);
    if (row.signs.some((s) => s.requirementIndex === idx)) {
      await this.prisma.junakSkillRequirementSign.deleteMany({ where: { junakSkillId: id, requirementIndex: idx } });
      await this.record(AuditAction.SKILL_REQUIREMENT_UNSIGNED, junak, toJunakSkillView(row), actor, { requirementIndex: idx });
    }
    return toJunakSkillView(await this.findOwnedOrThrow(junakId, id));
  }

  async achieve(junakId: string, id: string, dto: AchieveJunakSkillDto, actor: CurrentUserPayload): Promise<JunakSkillView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    if (row.achievedAt) throw new ConflictException('Вмілість уже здобуто');
    const achievedAt = parseHistoryDate(dto.achievedAt);
    const updated = await this.prisma.junakSkill.update({
      where: { id },
      data: { achievedAt, examiner: blankToNull(dto.examiner) ?? null, certificateNumber: blankToNull(dto.certificateNumber) ?? null },
      include: JUNAK_SKILL_INCLUDE,
    });
    const view = toJunakSkillView(updated);
    await this.record(AuditAction.SKILL_ACHIEVED, junak, view, actor);
    return view;
  }

  async create(junakId: string, dto: CreateJunakSkillDto, actor: CurrentUserPayload): Promise<JunakSkillView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const level = await this.findLevelOrThrow(dto.levelId, actor);
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
        throw new ConflictException(DUPLICATE_MESSAGE);
      }
      throw err;
    }
    const view = toJunakSkillView(row);
    await this.record(AuditAction.SKILL_ACHIEVED, junak, view, actor);
    return view;
  }

  async update(junakId: string, id: string, dto: UpdateJunakSkillDto, actor: CurrentUserPayload): Promise<JunakSkillView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const existing = await this.findOwnedOrThrow(junakId, id);
    if (!existing.achievedAt) throw new ConflictException('Вмілість ще не здобуто');
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
    // Achieved: writers only. Started: writers any time; the junak only their own with zero signs.
    const probe = await this.prisma.junakSkill.findUnique({ where: { id }, select: { junakId: true, achievedAt: true } });
    const startedSelf = !!probe && probe.junakId === junakId && !probe.achievedAt && actor.userId === junakId;
    const junak = startedSelf
      ? (await loadJunakForSelfOrWrite(this.prisma, junakId, actor)).junak
      : await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    if (startedSelf && row.signs.length > 0) {
      throw new ForbiddenException('Розпочату вмілість з підписами може прибрати лише виховник');
    }
    await this.prisma.junakSkill.delete({ where: { id } });
    await this.record(AuditAction.SKILL_REMOVED, junak, toJunakSkillView(row), actor);
    return { success: true };
  }

  private async findLevelOrThrow(levelId: string, actor: CurrentUserPayload) {
    const level = await this.prisma.skillLevel.findUnique({ where: { id: levelId }, include: { skill: true } });
    if (!level || (level.skill.kurinId !== null && level.skill.kurinId !== actor.kurinId)) {
      throw new NotFoundException('Вмілість не знайдено');
    }
    return level;
  }

  /** Index must be a non-negative integer within the level's requirements; the record must be started. */
  private parseIndex(raw: string, row: { achievedAt: Date | null; level: { requirements: unknown } }): number {
    if (row.achievedAt) throw new ConflictException('Вмілість уже здобуто');
    const count = (row.level.requirements as SkillRequirement[]).length;
    const idx = /^\d+$/.test(raw) ? Number(raw) : -1;
    if (idx < 0 || idx >= count) throw new BadRequestException('Невірний номер вимоги');
    return idx;
  }

  private async findOwnedOrThrow(junakId: string, id: string) {
    const row = await this.prisma.junakSkill.findUnique({ where: { id }, include: JUNAK_SKILL_INCLUDE });
    if (!row || row.junakId !== junakId) {
      throw new NotFoundException('Запис не знайдено');
    }
    return row;
  }

  private record(
    action: AuditAction,
    junak: HistoryJunak,
    view: JunakSkillView,
    actor: CurrentUserPayload,
    extra: Record<string, unknown> = {},
  ) {
    return this.audit.record({
      kurinId: junak.kurinId,
      actorId: actor.userId,
      action,
      subjectUserId: junak.id,
      entityId: view.id,
      details: { subjectName: personLabel(junak), skillName: view.skillName, level: view.level, achievedAt: view.achievedAt, ...extra },
    });
  }
}
