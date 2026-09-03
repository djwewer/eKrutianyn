import { PositionType } from '@prisma/client';

export const KURIN_POSITIONS: PositionType[] = [
  PositionType.KURINNYI,
  PositionType.SUDDIA,
  PositionType.PYSAR,
  PositionType.SKARBNYK,
  PositionType.INTENDANT,
  PositionType.KHORUNZHYI,
  PositionType.SMM,
];

export const HURTOK_POSITIONS: PositionType[] = [
  PositionType.HURTKOVYI,
  PositionType.SUDDIA,
  PositionType.PYSAR,
  PositionType.SKARBNYK,
];
