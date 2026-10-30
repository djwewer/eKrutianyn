import type { SkillGroup } from '@/lib/types';

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
