// Events are date-only values stored as UTC midnight, so their calendar date is
// read from the UTC part of the ISO string; `today` is the viewer's local date.
export function eventDate(iso: string) {
  const d = new Date(iso);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), weekday: d.getUTCDay() };
}
// yyyy-mm-dd of the viewer's local date (not the UTC date).
export function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// dd.mm.yyyy, same shape as toLocaleDateString('uk-UA'), without a timezone shift.
export function formatEventDate(iso: string) {
  const { year, month, day } = eventDate(iso);
  return `${String(day).padStart(2, '0')}.${String(month + 1).padStart(2, '0')}.${year}`;
}
