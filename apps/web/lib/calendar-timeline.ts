import type { KurinCalendarEvent } from '@/lib/types';
import { eventDate } from '@/lib/dates';

export type TimelineView = 'next' | number; // number = calendar year
// month 0-11; LATER_MONTH marks the trailing «Пізніше» bucket (events beyond the 12 months).
export const LATER_MONTH = 12;
export type TimelineMonth = { year: number; month: number; events: KurinCalendarEvent[] };

export const MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];
export const MONTH_NAMES_GENITIVE = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];
// Indexed by Date#getDay() (0 = Sunday).
export const WEEKDAY_CODES = ['НД', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

const dayNumber = (year: number, month: number, day: number) => year * 10000 + (month + 1) * 100 + day;
const eventDay = (iso: string) => {
  const { year, month, day } = eventDate(iso);
  return dayNumber(year, month, day);
};
export function buildTimeline(events: KurinCalendarEvent[], view: TimelineView, today: Date): TimelineMonth[] {
  const todayNum = dayNumber(today.getFullYear(), today.getMonth(), today.getDate());
  const ty = today.getFullYear();
  const tm = today.getMonth();

  if (view === 'next') {
    const months: TimelineMonth[] = [];
    for (let i = 0; i < 12; i++) {
      months.push({ year: ty + Math.floor((tm + i) / 12), month: (tm + i) % 12, events: [] });
    }
    const later: TimelineMonth = { year: ty + Math.floor((tm + 12) / 12), month: LATER_MONTH, events: [] };
    const upcoming = events
      .filter((e) => eventDay(e.endDate ?? e.startDate) >= todayNum)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (const e of upcoming) {
      const s = eventDate(e.startDate);
      // An event already under way (started before this month) sits in the first month.
      const idx = (s.year - ty) * 12 + (s.month - tm);
      const target = months[Math.max(idx, 0)];
      if (target) target.events.push(e);
      else later.events.push(e);
    }
    if (later.events.length) months.push(later);
    return months;
  }

  const months: TimelineMonth[] = [];
  const last = view === ty ? tm : 11;
  for (let m = last; m >= 0; m--) months.push({ year: view, month: m, events: [] });
  const past = events
    .filter((e) => eventDay(e.startDate) < todayNum)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  for (const e of past) {
    const s = eventDate(e.startDate);
    if (s.year !== view) continue;
    months.find((x) => x.month === s.month)?.events.push(e);
  }
  return months;
}
