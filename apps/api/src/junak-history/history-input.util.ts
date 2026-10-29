import { BadRequestException } from '@nestjs/common';
import { parseNotFutureDate } from '../common/date.util';

export const HISTORY_MIN_YEAR = 1990;

/** YYYY-MM-DD → UTC-midnight Date; not in the future and not before 1990. */
export function parseHistoryDate(value: string): Date {
  const date = parseNotFutureDate(value);
  if (date.getUTCFullYear() < HISTORY_MIN_YEAR) {
    throw new BadRequestException(`Дата має бути не раніше ${HISTORY_MIN_YEAR} року`);
  }
  return date;
}

/** PATCH semantics: undefined = leave as is, null = clear, string = set. */
export function patchHistoryDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parseHistoryDate(value);
}

/** Optional free text: trimmed; blank → null; undefined passes through (PATCH "no change"). */
export function blankToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
