import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, Role, Skill, SkillGroup, SkillLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { SkillRequirement } from './skill.types';
import { CreateSkillDto, SkillLevelInputDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

export const SKILL_GROUP_ORDER: SkillGroup[] = [
  SkillGroup.PRACTICAL,
  SkillGroup.FIRST_AID,
  SkillGroup.NATURE,
  SkillGroup.SPORT,
  SkillGroup.HOME,
  SkillGroup.SPECIAL,
  SkillGroup.ARTS,
  SkillGroup.AVIATION,
  SkillGroup.SEA,
];

export interface SkillLevelView {
  id: string;
  level: number;
  note: string | null;
  requirements: SkillRequirement[];
}

export interface SkillView {
  id: string;
  name: string;
  group: SkillGroup;
  isCustom: boolean;
  levels: SkillLevelView[];
}

export interface SkillCatalogGroupView {
  group: SkillGroup;
  skills: SkillView[];
}

const WITH_LEVELS = { levels: { orderBy: { level: 'asc' as const } } };

function toSkillView(skill: Skill & { levels: SkillLevel[] }): SkillView {
  return {
    id: skill.id,
    name: skill.name,
    group: skill.group,
    isCustom: skill.kurinId !== null,
    levels: skill.levels.map((l) => ({
      id: l.id,
      level: l.level,
      note: l.note,
      requirements: l.requirements as unknown as SkillRequirement[],
    })),
  };
}

@Injectable()
export class SkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async catalog(actor: CurrentUserPayload): Promise<SkillCatalogGroupView[]> {
    const skills = await this.prisma.skill.findMany({
      where: { OR: [{ kurinId: null }, { kurinId: actor.kurinId }] },
      include: WITH_LEVELS,
    });
    const views = skills.map(toSkillView).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    return SKILL_GROUP_ORDER.map((group) => ({ group, skills: views.filter((s) => s.group === group) }));
  }

  async create(dto: CreateSkillDto, actor: CurrentUserPayload): Promise<SkillView> {
    this.assertZvyazkovyi(actor);
    const name = this.trimName(dto.name);
    const levels = this.normalizeLevels(dto.levels);
    await this.assertNameFree(name, actor.kurinId);
    const skill = await this.prisma.skill.create({
      data: { kurinId: actor.kurinId, name, group: dto.group, levels: { create: levels } },
      include: WITH_LEVELS,
    });
    await this.record(AuditAction.CUSTOM_SKILL_CREATED, skill, actor);
    return toSkillView(skill);
  }

  async update(id: string, dto: UpdateSkillDto, actor: CurrentUserPayload): Promise<SkillView> {
    this.assertZvyazkovyi(actor);
    const skill = await this.findOwnCustomOrThrow(id, actor);
    if (dto.name === null) throw new BadRequestException('Назва вмілості не може бути порожньою');
    if (dto.group === null) throw new BadRequestException('Оберіть групу вмілості');
    const name = dto.name != null ? this.trimName(dto.name) : undefined;
    if (name !== undefined && name.toLowerCase() !== skill.name.toLowerCase()) {
      await this.assertNameFree(name, actor.kurinId, id);
    }
    if (dto.levels) {
      const levels = this.normalizeLevels(dto.levels);
      const keep = new Set(levels.map((l) => l.level));
      const removedIds = skill.levels.filter((l) => !keep.has(l.level)).map((l) => l.id);
      if (removedIds.length > 0) {
        const achieved = await this.prisma.junakSkill.count({ where: { levelId: { in: removedIds } } });
        if (achieved > 0) {
          throw new ConflictException('Цей рівень уже здобули юнаки — його не можна прибрати');
        }
      }
      await this.prisma.$transaction([
        this.prisma.skillLevel.deleteMany({ where: { id: { in: removedIds } } }),
        ...levels.map((l) =>
          this.prisma.skillLevel.upsert({
            where: { skillId_level: { skillId: id, level: l.level } },
            update: { requirements: l.requirements, note: l.note },
            create: { skillId: id, ...l },
          }),
        ),
      ]);
    }
    const updated = await this.prisma.skill.update({
      where: { id },
      data: { name, group: dto.group },
      include: WITH_LEVELS,
    });
    await this.record(AuditAction.CUSTOM_SKILL_UPDATED, updated, actor);
    return toSkillView(updated);
  }

  async remove(id: string, actor: CurrentUserPayload): Promise<{ success: true }> {
    this.assertZvyazkovyi(actor);
    const skill = await this.findOwnCustomOrThrow(id, actor);
    const achieved = await this.prisma.junakSkill.count({ where: { level: { skillId: id } } });
    if (achieved > 0) {
      throw new ConflictException('Цю вмілість уже здобули юнаки — видалити її не можна');
    }
    await this.prisma.skill.delete({ where: { id } });
    await this.record(AuditAction.CUSTOM_SKILL_DELETED, skill, actor);
    return { success: true };
  }

  private trimName(raw: string): string {
    const name = raw.trim();
    if (name === '') {
      throw new BadRequestException('Назва вмілості не може бути порожньою');
    }
    return name;
  }

  private assertZvyazkovyi(actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private async findOwnCustomOrThrow(id: string, actor: CurrentUserPayload) {
    const skill = await this.prisma.skill.findUnique({ where: { id }, include: WITH_LEVELS });
    if (!skill || (skill.kurinId !== null && skill.kurinId !== actor.kurinId)) {
      throw new NotFoundException('Вмілість не знайдено');
    }
    if (skill.kurinId === null) {
      throw new ForbiddenException('Вмілості з каталогу УПЮ змінювати не можна');
    }
    return skill;
  }

  private async assertNameFree(name: string, kurinId: string, exceptId?: string) {
    const clash = await this.prisma.skill.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        OR: [{ kurinId: null }, { kurinId }],
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
    });
    if (clash) {
      throw new ConflictException('Вмілість з такою назвою вже є в каталозі');
    }
  }

  private normalizeLevels(levels: SkillLevelInputDto[]) {
    const seen = new Set<number>();
    return levels.map((l) => {
      if (seen.has(l.level)) {
        throw new BadRequestException('Рівні вмілості не можуть повторюватися');
      }
      seen.add(l.level);
      const requirements: SkillRequirement[] = l.requirements
        .map((text) => text.trim())
        .filter((text) => text !== '')
        .map((text) => ({ text }));
      if (requirements.length === 0) {
        throw new BadRequestException('Кожен рівень має містити хоча б одну вимогу');
      }
      return {
        level: l.level,
        requirements: requirements as unknown as Prisma.InputJsonValue,
        note: l.note?.trim() || null,
      };
    });
  }

  private record(action: AuditAction, skill: Skill, actor: CurrentUserPayload) {
    return this.audit.record({
      kurinId: actor.kurinId,
      actorId: actor.userId,
      action,
      entityId: skill.id,
      details: { skillName: skill.name, group: skill.group },
    });
  }
}
