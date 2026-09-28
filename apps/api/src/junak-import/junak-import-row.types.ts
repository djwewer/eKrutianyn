import { PositionType } from '@prisma/client';

export interface ResolvedJunakRow {
  matchedUserId?: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  birthDate?: string;
  email: string;
  phone?: string;
  hurtokName?: string;
  kurinPositionTypes?: PositionType[];
  hurtokPositionTypes?: PositionType[];
  guardians?: { name: string; phone?: string; email?: string }[];
  degreeDates?: {
    PRYHYLNYK?: string;
    UCHASNYK?: string;
    ROZVIDUVACH?: string;
  };
}

export interface JunakImportRowResult {
  row: number;
  junakId?: string;
  created?: boolean;
  succeededSteps: string[];
  error?: string;
}
