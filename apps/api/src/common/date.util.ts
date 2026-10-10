import { BadRequestException } from '@nestjs/common';

/**
 * Parses a YYYY-MM-DD calendar date (stored as UTC midnight, the way the rest
 * of the app stores dates) and rejects dates in the future — a degree can't
 * have been earned tomorrow. A day of slack covers a client whose local date
 * is already ahead of the server's UTC date.
 */
export function parseNotFutureDate(value: string): Date {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Невірна дата');
  }
  const limit = Date.now() + 24 * 60 * 60 * 1000;
  if (date.getTime() > limit) {
    throw new BadRequestException('Дата не може бути в майбутньому');
  }
  return date;
}
