import type { Role, PositionType } from '@/lib/types';

export const ROLE_LABELS: Record<Role, string> = {
  JUNAK: 'Юнак',
  VYKHOVNYK: 'Виховник',
  ZVYAZKOVYI: "Зв'язковий",
};

export const POSITION_LABELS: Record<PositionType, string> = {
  KURINNYI: 'Курінний',
  SUDDIA: 'Суддя',
  PYSAR: 'Писар',
  SKARBNYK: 'Скарбник',
  INTENDANT: 'Інтендант',
  KHORUNZHYI: 'Хорунжий',
  SMM: 'СММник',
  HURTKOVYI: 'Гуртковий',
};

/** Positions that can be held per scope (mirrors apps/api/src/kurin-positions/position-rules.ts). */
export const KURIN_SCOPE_POSITIONS: PositionType[] = ['KURINNYI', 'SUDDIA', 'PYSAR', 'SKARBNYK', 'INTENDANT', 'KHORUNZHYI', 'SMM'];
export const HURTOK_SCOPE_POSITIONS: PositionType[] = ['HURTKOVYI', 'SUDDIA', 'PYSAR', 'SKARBNYK'];
