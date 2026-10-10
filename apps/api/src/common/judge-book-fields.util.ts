import { GuardianRelation } from '@prisma/client';
import { DEGREE_LABELS, DegreeDates, currentDegree, formatSheetDate } from './degrees.util';

export interface BookJunak {
  firstName: string;
  lastName: string;
  nickname?: string | null;
  birthDate?: Date | null;
  email: string;
  phone?: string | null;
  residence?: string | null;
  studyPlace?: string | null;
  hurtokName?: string | null;
}

export interface BookGuardian {
  relation: GuardianRelation;
  name: string;
  phone: string;
  email: string | null;
}

/**
 * Mapping fields the app PUSHES into an existing row (nightly / manual
 * write-back). Identity fields (name, nickname, birth date, hurtok) are
 * deliberately not pushed: the name is how a row is verified before writing
 * into it, and the rest are maintained by the judge in the sheet.
 */
export const PUSHED_FIELDS: ReadonlySet<string> = new Set([
  'PHONE',
  'EMAIL',
  'RESIDENCE',
  'STUDY_PLACE',
  'DEGREE_PRYHYLNYK_DATE',
  'DEGREE_UCHASNYK_DATE',
  'DEGREE_ROZVIDUVACH_DATE',
  'DEGREE_SKOB_DATE',
  'CURRENT_DEGREE',
  'FATHER_NAME',
  'FATHER_PHONE',
  'FATHER_EMAIL',
  'MOTHER_NAME',
  'MOTHER_PHONE',
  'MOTHER_EMAIL',
  'GUARDIAN_1_NAME',
  'GUARDIAN_1_PHONE',
  'GUARDIAN_1_EMAIL',
  'GUARDIAN_2_NAME',
  'GUARDIAN_2_PHONE',
  'GUARDIAN_2_EMAIL',
]);

/**
 * The single place that turns what the app knows about a junak into sheet
 * cell text, keyed by import-mapping field. Used both when appending a new
 * junak's row and when writing updates into an existing row, so the two can
 * never disagree about a format. Fields with nothing to say are omitted
 * (never an empty string): callers must not blank out a cell.
 *
 * `guardians` must be in creation order — the generic "опікун 1/2" slots are
 * filled from the non-mother/father contacts in that order.
 */
export function buildJunakBookValues(
  junak: BookJunak,
  guardians: BookGuardian[],
  degrees: DegreeDates,
): Map<string, string> {
  const values = new Map<string, string>();
  const put = (field: string, value: string | null | undefined) => {
    if (value && value.trim()) values.set(field, value.trim());
  };

  put('FIRST_LAST_NAME', `${junak.firstName} ${junak.lastName}`);
  put('NICKNAME', junak.nickname);
  put('BIRTH_DATE', junak.birthDate ? formatSheetDate(junak.birthDate) : null);
  put('EMAIL', junak.email);
  put('PHONE', junak.phone);
  put('HURTOK', junak.hurtokName);
  put('RESIDENCE', junak.residence);
  put('STUDY_PLACE', junak.studyPlace);

  put('DEGREE_PRYHYLNYK_DATE', degrees.PRYHYLNYK ? formatSheetDate(degrees.PRYHYLNYK) : null);
  put('DEGREE_UCHASNYK_DATE', degrees.UCHASNYK ? formatSheetDate(degrees.UCHASNYK) : null);
  put('DEGREE_ROZVIDUVACH_DATE', degrees.ROZVIDUVACH ? formatSheetDate(degrees.ROZVIDUVACH) : null);
  put('DEGREE_SKOB_DATE', degrees.SKOB ? formatSheetDate(degrees.SKOB) : null);
  const current = currentDegree(degrees);
  put('CURRENT_DEGREE', current ? DEGREE_LABELS[current] : null);

  const mother = guardians.find((g) => g.relation === GuardianRelation.MOTHER);
  const father = guardians.find((g) => g.relation === GuardianRelation.FATHER);
  const others = guardians.filter((g) => g.relation === GuardianRelation.GUARDIAN);
  const putGuardian = (prefix: string, guardian: BookGuardian | undefined) => {
    if (!guardian) return;
    put(`${prefix}_NAME`, guardian.name);
    put(`${prefix}_PHONE`, guardian.phone);
    put(`${prefix}_EMAIL`, guardian.email);
  };
  putGuardian('FATHER', father);
  putGuardian('MOTHER', mother);
  putGuardian('GUARDIAN_1', others[0]);
  putGuardian('GUARDIAN_2', others[1]);

  return values;
}
