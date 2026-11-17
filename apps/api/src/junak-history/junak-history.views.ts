import {
  JunakActivityRole,
  JunakCamp,
  JunakPastPosition,
  JunakRemark,
  JunakRemarkKind,
  JunakSkill,
  JunakSkillRequirementSign,
  JunakVfv,
  PositionScope,
  PositionType,
  Skill,
  SkillGroup,
  SkillLevel,
} from '@prisma/client';
import { SkillRequirement } from '../skills/skill.types';

export function isoDate(date: Date): string;
export function isoDate(date: Date | null): string | null;
export function isoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export const JUNAK_SKILL_INCLUDE = {
  level: { include: { skill: true } },
  signs: {
    orderBy: { requirementIndex: 'asc' },
    include: { signedBy: { select: { firstName: true, lastName: true, nickname: true } } },
  },
} as const;
type JunakSkillRow = JunakSkill & {
  level: SkillLevel & { skill: Skill };
  signs: (JunakSkillRequirementSign & { signedBy: { firstName: string; lastName: string; nickname: string | null } })[];
};

export interface JunakSkillSignView {
  index: number;
  signedAt: string;
  signedByName: string;
}

export interface JunakSkillView {
  id: string;
  levelId: string;
  skillId: string;
  skillName: string;
  group: SkillGroup;
  level: number;
  isCustom: boolean;
  status: 'STARTED' | 'ACHIEVED';
  startedAt: string | null;
  achievedAt: string | null;
  requirements: SkillRequirement[];
  signs: JunakSkillSignView[];
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
    status: row.achievedAt ? 'ACHIEVED' : 'STARTED',
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    achievedAt: isoDate(row.achievedAt),
    requirements: row.level.requirements as unknown as SkillRequirement[],
    signs: row.signs.map((s) => ({
      index: s.requirementIndex,
      signedAt: s.signedAt.toISOString(),
      signedByName: `${s.signedBy.firstName} ${s.signedBy.lastName}`,
    })),
    examiner: row.examiner,
    certificateNumber: row.certificateNumber,
  };
}

export interface JunakSkillsView {
  canEdit: boolean;
  canStart: boolean;
  items: JunakSkillView[];
}

export interface JunakVfvView {
  id: string;
  achievedAt: string | null;
  note: string | null;
}

export function toVfvView(row: JunakVfv): JunakVfvView {
  return { id: row.id, achievedAt: isoDate(row.achievedAt), note: row.note };
}

export interface JunakCampView {
  id: string;
  name: string;
  yearFrom: number;
  yearTo: number | null;
  role: JunakActivityRole;
}

export function toCampView(row: JunakCamp): JunakCampView {
  return { id: row.id, name: row.name, yearFrom: row.yearFrom, yearTo: row.yearTo, role: row.role };
}

export interface JunakRemarkView {
  id: string;
  kind: JunakRemarkKind;
  text: string;
  howToFix: string | null;
  date: string;
}

export function toRemarkView(row: JunakRemark): JunakRemarkView {
  return { id: row.id, kind: row.kind, text: row.text, howToFix: row.howToFix, date: isoDate(row.date) };
}

export interface JunakPastPositionView {
  id: string;
  title: string;
  scope: PositionScope;
  yearFrom: number;
  yearTo: number | null;
}

export function toPastPositionView(row: JunakPastPosition): JunakPastPositionView {
  return { id: row.id, title: row.title, scope: row.scope, yearFrom: row.yearFrom, yearTo: row.yearTo };
}

export interface HistoryDatesView {
  upyJoinedAt: string | null;
  plastOathAt: string | null;
}

export interface JunakPositionView {
  id: string;
  positionType: PositionType;
  scope: PositionScope;
  hurtokName: string | null;
  assignedAt: string;
  removedAt: string | null;
}

export interface JunakHistoryView {
  canEdit: boolean;
  upyJoinedAt: string | null;
  plastOathAt: string | null;
  skills: JunakSkillView[];
  vfv: JunakVfvView[];
  camps: JunakCampView[];
  remarks: JunakRemarkView[];
  pastPositions: JunakPastPositionView[];
  positions: JunakPositionView[];
}
