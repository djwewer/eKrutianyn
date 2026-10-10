import { GuardianRelation, PositionType } from '@prisma/client';

export interface ResolvedJunakRow {
  /** Index of this row within the sheet's data rows (0-based, after the header row) — NOT the row's position in a filtered/submitted array, which can differ when blank rows were skipped. */
  rowIndex: number;
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
  residence?: string;
  studyPlace?: string;
  /** YYYY-MM-DD — the "Скоб" degree has no proby behind it, so it is a plain date. */
  skobDate?: string;
  /** `relation` defaults to GUARDIAN when absent (older clients / generic "опікун" columns). */
  guardians?: { name: string; phone?: string; email?: string; relation?: GuardianRelation }[];
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
