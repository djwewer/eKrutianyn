import type { KurinCalendarEvent } from '@/lib/types';

export type TimelineView = 'next' | number; // number = calendar year
export type TimelineMonth = { year: number; month: number /* 0-11 */; events: KurinCalendarEvent[] };

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

// Events are date-only values stored as UTC midnight, so their calendar date is
// read from the UTC part of the ISO string; `today` is the viewer's local date.
export function eventDate(iso: string) {
  const d = new Date(iso);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), weekday: d.getUTCDay() };
}
const dayNumber = (year: number, month: number, day: number) => year * 10000 + (month + 1) * 100 + day;
const eventDay = (iso: string) => {
  const { year, month, day } = eventDate(iso);
  return dayNumber(year, month, day);
};
// yyyy-mm-dd of the viewer's local date (not the UTC date).
export function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// dd.mm.yyyy, same shape as toLocaleDateString('uk-UA'), without a timezone shift.
export function formatEventDate(iso: string) {
  const { year, month, day } = eventDate(iso);
  return `${String(day).padStart(2, '0')}.${String(month + 1).padStart(2, '0')}.${year}`;
}

export function buildTimeline(events: KurinCalendarEvent[], view: TimelineView, today: Date): TimelineMonth[] {
  const todayNum = dayNumber(today.getFullYear(), today.getMonth(), today.getDate());
  const ty = today.getFullYear();
  const tm = today.getMonth();

  if (view === 'next') {
    const months: TimelineMonth[] = [];
    for (let i = 0; i < 12; i++) {
      months.push({ year: ty + Math.floor((tm + i) / 12), month: (tm + i) % 12, events: [] });
    }
    const upcoming = events
      .filter((e) => eventDay(e.endDate ?? e.startDate) >= todayNum)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (const e of upcoming) {
      const s = eventDate(e.startDate);
      // An event already under way (started before this month) sits in the first month.
      const idx = (s.year - ty) * 12 + (s.month - tm);
      const target = months[Math.max(idx, 0)];
      if (target) target.events.push(e);
    }
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
