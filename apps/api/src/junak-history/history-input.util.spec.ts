import { BadRequestException } from '@nestjs/common';
import { blankToNull, parseHistoryDate, patchHistoryDate } from './history-input.util';

describe('history input utils', () => {
  it('parses a past calendar date as UTC midnight', () => {
    expect(parseHistoryDate('2020-09-01').toISOString()).toBe('2020-09-01T00:00:00.000Z');
  });

  it('rejects dates before 1990 and in the future', () => {
    expect(() => parseHistoryDate('1989-12-31')).toThrow(BadRequestException);
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(() => parseHistoryDate(inThreeDays)).toThrow(BadRequestException);
  });

  it('treats undefined as "no change" and null as "clear" for PATCH dates', () => {
    expect(patchHistoryDate(undefined)).toBeUndefined();
    expect(patchHistoryDate(null)).toBeNull();
    expect(patchHistoryDate('2021-03-04')?.toISOString()).toBe('2021-03-04T00:00:00.000Z');
  });

  it('trims optional text and turns blank into null', () => {
    expect(blankToNull(undefined)).toBeUndefined();
    expect(blankToNull(null)).toBeNull();
    expect(blankToNull('   ')).toBeNull();
    expect(blankToNull('  Остап ')).toBe('Остап');
  });
});
