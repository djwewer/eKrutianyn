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
