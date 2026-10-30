import type { JunakActivityRole, JunakRemarkKind, PositionScope, SkillGroup } from '@/lib/types';

export const SKILL_GROUP_ORDER: SkillGroup[] = [
  'PRACTICAL',
  'FIRST_AID',
  'NATURE',
  'SPORT',
  'HOME',
  'SPECIAL',
  'ARTS',
  'AVIATION',
  'SEA',
];

export const SKILL_GROUP_LABELS: Record<SkillGroup, string> = {
  PRACTICAL: 'Вмілості практичного пластування',
  FIRST_AID: 'Вмілості першої допомоги і рятівництва',
  NATURE: 'Природничі вмілості',
  SPORT: 'Спортивні вмілості',
  HOME: 'Вмілості домашньої зарадності',
  SPECIAL: 'Вмілості спеціального зацікавлення',
  ARTS: 'Мистецькі вмілості',
  AVIATION: 'Вмілості літунського пластування',
  SEA: 'Вмілості морського пластування',
};

/** Рівень вмілості = проба, до якої вона призначена. */
export const SKILL_LEVEL_LABELS: Record<number, string> = {
  1: 'Перша проба',
  2: 'Друга проба',
  3: 'Третя проба',
};

export const CAMP_ROLE_LABELS: Record<JunakActivityRole, string> = {
  PARTICIPANT: 'учасник',
  PROVID: 'провід',
};

export const REMARK_KIND_LABELS: Record<JunakRemarkKind, string> = {
  AWARD: 'Відзначення',
  WARNING: 'Пересторога',
};

export const POSITION_SCOPE_LABELS: Record<PositionScope, string> = {
  KURIN: 'курінь',
  HURTOK: 'гурток',
};

/** 2021–2024; a single year when there is no (or the same) end year. */
export function formatYears(from: number, to: number | null): string {
  return to !== null && to !== from ? `${from}–${to}` : `${from}`;
}
