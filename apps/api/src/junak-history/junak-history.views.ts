import { JunakSkill, Skill, SkillGroup, SkillLevel } from '@prisma/client';

export function isoDate(date: Date): string;
export function isoDate(date: Date | null): string | null;
export function isoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export const JUNAK_SKILL_INCLUDE = { level: { include: { skill: true } } } as const;
type JunakSkillRow = JunakSkill & { level: SkillLevel & { skill: Skill } };

export interface JunakSkillView {
  id: string;
  levelId: string;
  skillId: string;
  skillName: string;
  group: SkillGroup;
  level: number;
  isCustom: boolean;
  achievedAt: string;
  examiner: string | null;
  certificateNumber: string | null;
}

export function toJunakSkillView(row: JunakSkillRow): JunakSkillView {
  return {
    id: row.id,
    levelId: row.levelId,
    skillId: row.level.skillId,
    skillName: row.level.skill.name,
    group: row.level.skill.group,
    level: row.level.level,
    isCustom: row.level.skill.kurinId !== null,
    achievedAt: isoDate(row.achievedAt),
    examiner: row.examiner,
    certificateNumber: row.certificateNumber,
  };
}

export interface JunakSkillsView {
  canEdit: boolean;
  items: JunakSkillView[];
}
