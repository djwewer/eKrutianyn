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
    await this.findOwnedOrThrow(junakId, id);
    const idx = this.parseIndexFormat(index);
    const signed = await this.prisma.$transaction(async (tx) => {
      // Lock the record so a concurrent credit cannot interleave with the sign.
      await tx.$queryRaw`SELECT id FROM "JunakSkill" WHERE id = ${id} FOR UPDATE`;
      const fresh = await tx.junakSkill.findUnique({ where: { id }, include: { level: true } });
      if (!fresh || fresh.junakId !== junakId) throw new NotFoundException('Запис не знайдено');
      if (fresh.achievedAt) throw new ConflictException('Вмілість уже здобуто');
      const count = (fresh.level.requirements as unknown as SkillRequirement[]).length;
      if (idx >= count) throw new BadRequestException('Невірний номер вимоги');
      const res = await tx.junakSkillRequirementSign.createMany({
        data: [{ junakSkillId: id, requirementIndex: idx, signedById: actor.userId }],
        skipDuplicates: true,
      });
      return res.count === 1;
    });
    const view = toJunakSkillView(await this.findOwnedOrThrow(junakId, id));
    if (signed) await this.record(AuditAction.SKILL_REQUIREMENT_SIGNED, junak, view, actor, { requirementIndex: idx });
    return view;
  }

  async unsign(junakId: string, id: string, index: string, actor: CurrentUserPayload): Promise<JunakSkillView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
    if (row.achievedAt) throw new ConflictException('Вмілість уже здобуто');
    const idx = this.parseIndexFormat(index);
    // Any existing sign may be removed, even if the level now has fewer requirements.
    const res = await this.prisma.junakSkillRequirementSign.deleteMany({ where: { junakSkillId: id, requirementIndex: idx } });
    const view = toJunakSkillView(await this.findOwnedOrThrow(junakId, id));
    if (res.count > 0) await this.record(AuditAction.SKILL_REQUIREMENT_UNSIGNED, junak, view, actor, { requirementIndex: idx });
    return view;
  }

  async achieve(junakId: string, id: string, dto: AchieveJunakSkillDto, actor: CurrentUserPayload): Promise<JunakSkillView> {
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    await this.findOwnedOrThrow(junakId, id);
    const achievedAt = parseHistoryDate(dto.achievedAt);
    const res = await this.prisma.junakSkill.updateMany({
      where: { id, junakId, achievedAt: null },
      data: { achievedAt, examiner: blankToNull(dto.examiner) ?? null, certificateNumber: blankToNull(dto.certificateNumber) ?? null },
    });
    if (res.count === 0) throw new ConflictException('Вмілість уже здобуто');
    const view = toJunakSkillView(await this.findOwnedOrThrow(junakId, id));
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
    if (actor.userId === junakId) {
      const own = await this.findOwnedOrThrow(junakId, id);
      if (!own.achievedAt) {
        const { junak } = await loadJunakForSelfOrWrite(this.prisma, junakId, actor);
        const res = await this.prisma.junakSkill.deleteMany({
          where: {
            id,
            junakId,
            achievedAt: null,
            // Stale signs (beyond the level's current requirements) are hidden in the view, so they don't block.
            signs: { none: { requirementIndex: { lt: (own.level.requirements as unknown as unknown[]).length } } },
          },
        });
        if (res.count === 0) {
          const again = await this.prisma.junakSkill.findUnique({ where: { id }, select: { id: true } });
          if (!again) throw new NotFoundException('Запис не знайдено');
          throw new ForbiddenException('Розпочату вмілість з підписами може прибрати лише виховник');
        }
        await this.record(AuditAction.SKILL_REMOVED, junak, toJunakSkillView(own), actor);
        return { success: true };
      }
    }
    const junak = await loadJunakForWrite(this.prisma, junakId, actor);
    const row = await this.findOwnedOrThrow(junakId, id);
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

  /** Index must be a non-negative integer. */
  private parseIndexFormat(raw: string): number {
    if (!/^\d+$/.test(raw)) throw new BadRequestException('Невірний номер вимоги');
    return Number(raw);
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
