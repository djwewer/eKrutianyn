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

// Local calendar day as a sortable number (yyyymmdd), ignoring time of day.
function dayNumber(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
const eventDay = (iso: string) => dayNumber(new Date(iso));

export function buildTimeline(events: KurinCalendarEvent[], view: TimelineView, today: Date): TimelineMonth[] {
  const todayNum = dayNumber(today);
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
      const s = new Date(e.startDate);
      // An event already under way (started before this month) sits in the first month.
      const idx = (s.getFullYear() - ty) * 12 + (s.getMonth() - tm);
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
    const s = new Date(e.startDate);
    if (s.getFullYear() !== view) continue;
    months.find((x) => x.month === s.getMonth())?.events.push(e);
  }
  return months;
}
