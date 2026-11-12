'use client';

import { useMemo, useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useKurinCalendar, useCreateCalendarEvent, useDeleteCalendarEvent } from '@/lib/queries/kurin-calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { accessErrorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import { buildTimeline, MONTH_NAMES, MONTH_NAMES_GENITIVE, WEEKDAY_CODES, type TimelineView } from '@/lib/calendar-timeline';
import type { KurinCalendarEvent } from '@/lib/types';

const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

// A single inline calendar for picking a date range: click one day to start,
// click a second day to set the range end (earlier of the two becomes the
// start), or click the same day again for a one-day event.
function DateRangeField({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const base = startDate ? new Date(startDate) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const [pendingStart, setPendingStart] = useState<string | null>(startDate || null);
  const [pendingEnd, setPendingEnd] = useState<string | null>(endDate || null);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(cursor.year, cursor.month, 1);
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const result: { key: string; day: number }[] = [];
    for (let i = 0; i < leadingBlanks; i++) result.push({ key: `blank-${i}`, day: 0 });
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      result.push({ key, day });
    }
    return result;
  }, [cursor]);

  function handleDayClick(dayKey: string) {
    if (!pendingStart || pendingEnd) {
      setPendingStart(dayKey);
      setPendingEnd(null);
      return;
    }
    if (dayKey === pendingStart) {
      setPendingEnd(dayKey);
      onChange(dayKey, dayKey);
      setOpen(false);
      return;
    }
    const [newStart, newEnd] = dayKey < pendingStart ? [dayKey, pendingStart] : [pendingStart, dayKey];
    setPendingStart(newStart);
    setPendingEnd(newEnd);
    onChange(newStart, newEnd);
    setOpen(false);
  }

  const label = !startDate
    ? 'Оберіть дату'
    : !endDate || endDate === startDate
      ? new Date(startDate).toLocaleDateString('uk-UA')
      : `${new Date(startDate).toLocaleDateString('uk-UA')} – ${new Date(endDate).toLocaleDateString('uk-UA')}`;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Дата події"
        className="w-full justify-start"
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </Button>
      {open && (
        <div className="space-y-2 rounded-md border border-border p-2">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}
            >
              ◂
            </Button>
            <span className="text-sm font-medium">
              {MONTH_NAMES[cursor.month]} {cursor.year}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}
            >
              ▸
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {WEEKDAY_NAMES.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              if (cell.day === 0) return <div key={cell.key} />;
              const isEndpoint = cell.key === pendingStart || cell.key === pendingEnd;
              const inRange = !!pendingStart && !!pendingEnd && cell.key > pendingStart && cell.key < pendingEnd;
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => handleDayClick(cell.key)}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-md text-sm transition-colors hover:bg-accent-soft',
                    inRange && 'bg-accent-soft',
                    isEndpoint && 'bg-primary font-semibold text-primary-foreground',
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          {pendingStart && !pendingEnd && (
            <p className="text-xs text-muted-foreground">
              Обрано {new Date(pendingStart).toLocaleDateString('uk-UA')}. Клікніть ще раз цю саму дату для одноденної
              події, або іншу дату — для діапазону.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AddEventDialog({
  kurinId,
  open,
  onOpenChange,
}: {
  kurinId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreateCalendarEvent(kurinId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Додати подію</DialogTitle>
        <div className="space-y-2">
          <Input
            placeholder="Назва (напр. «Зимовий табір»)"
            autoComplete="off"
            maxLength={50}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <DateRangeField
            startDate={startDate}
            endDate={endDate}
            onChange={(newStart, newEnd) => {
              setStartDate(newStart);
              setEndDate(newEnd === newStart ? '' : newEnd);
            }}
          />
          <Input
            placeholder="Опис (необов'язково)"
            autoComplete="off"
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!title.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { title: title.trim(), startDate, endDate: endDate || undefined, description: description.trim() || undefined },
                {
                  onSuccess: () => {
                    setTitle('');
                    setEndDate('');
                    setDescription('');
                    onOpenChange(false);
                  },
                },
              )
            }
          >
            Додати
          </Button>
          {create.isError && <p className="text-sm text-destructive">{accessErrorMessage(create.error) ?? 'Не вдалося додати.'}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Закрити
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function formatShort(iso: string) {
  return new Date(iso).toLocaleDateString('uk-UA');
}

function EventCard({
  event,
  past,
  canEdit,
  onDelete,
  deleting,
}: {
  event: KurinCalendarEvent;
  past: boolean;
  canEdit: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : null;
  const multiDay = !!end && end.toDateString() !== start.toDateString();
  const dayLabel = multiDay ? `${start.getDate()}–${end.getDate()}` : String(start.getDate());
  return (
    <div className="flex items-center gap-[.9rem] rounded-[6px] border border-line bg-paper px-[.9rem] py-[.6rem]">
      <div className="min-w-[2.2rem] text-center font-display leading-none">
        <b className={cn('block text-[1.5rem] font-bold', past ? 'text-ink-2' : 'text-navy')}>{dayLabel}</b>
        <span className="font-mono text-[.66rem] tracking-[.06em] text-ink-2">{WEEKDAY_CODES[start.getDay()]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <b className="block leading-[1.25] break-words">{event.title}</b>
        {multiDay && (
          <small className="block font-mono text-[.76rem] text-ink-2">
            {formatShort(event.startDate)} – {formatShort(event.endDate!)}
          </small>
        )}
        {event.description && <small className="block text-[.84rem] break-words text-ink-2">{event.description}</small>}
      </div>
      {canEdit && (
        <Button size="sm" variant="outline" disabled={deleting} onClick={onDelete}>
          Видалити
        </Button>
      )}
    </div>
  );
}

function TimelineView({
  events,
  kurinId,
  canEdit,
  today,
  view,
  onViewChange,
}: {
  events: KurinCalendarEvent[];
  kurinId: string;
  canEdit: boolean;
  today: Date;
  view: TimelineView;
  onViewChange: (view: TimelineView) => void;
}) {
  const remove = useDeleteCalendarEvent(kurinId);
  const months = useMemo(() => buildTimeline(events, view, today), [events, view, today]);
  const next = view === 'next';
  const ty = today.getFullYear();
  const tm = today.getMonth();
  const views: { value: TimelineView; label: string }[] = [
    { value: 'next', label: 'Наступні 12 місяців' },
    { value: ty, label: String(ty) },
    { value: ty - 1, label: String(ty - 1) },
    { value: ty - 2, label: String(ty - 2) },
  ];

  return (
    <>
      <div
        role="radiogroup"
        aria-label="Період"
        className="mb-[1.2rem] inline-flex max-w-full flex-wrap overflow-hidden rounded-[4px] border-2 border-line"
      >
        {views.map(({ value, label }) => {
          const on = value === view;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onViewChange(value)}
              className={cn(
                'cursor-pointer border-0 px-[.8rem] py-[.4rem] font-display text-[.78rem] font-semibold tracking-[.06em] uppercase [&+button]:border-l-2 [&+button]:border-line',
                on ? 'bg-navy text-navy-ink' : 'bg-paper text-ink',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="relative grid gap-[1.1rem] before:absolute before:top-[.4rem] before:bottom-[.4rem] before:left-[6.6rem] before:w-0.5 before:bg-line max-[759px]:before:hidden">
        {months.map(({ year, month, events: list }) => {
          const showNow = next && year === ty && month === tm;
          return (
            <section
              key={`${year}-${month}`}
              className={cn(
                'relative grid grid-cols-[6.6rem_minmax(0,1fr)] items-start gap-x-[1.2rem] after:absolute after:top-[.8rem] after:left-[calc(6.6rem-5px)] after:size-3 after:rounded-full after:border-2 after:bg-background after:content-[""] max-[759px]:grid-cols-1 max-[759px]:gap-[.4rem] max-[759px]:after:hidden',
                list.length ? 'after:border-navy' : 'after:border-line max-[759px]:grid-cols-[auto_1fr] max-[759px]:items-baseline max-[759px]:gap-[.8rem]',
              )}
            >
              <h2
                className={cn(
                  'm-0 pt-[.6rem] font-display text-base leading-[1.1] font-semibold tracking-[.06em] uppercase max-[759px]:flex max-[759px]:items-baseline max-[759px]:gap-2 max-[759px]:pt-0',
                  !list.length && 'text-ink-2',
                )}
              >
                {MONTH_NAMES[month]}{' '}
                <span className="block font-mono text-[.72rem] font-normal tracking-[.04em] text-ink-2 normal-case max-[759px]:inline">
                  {year}
                </span>
              </h2>
              <div className="grid gap-2 pl-[.6rem] max-[759px]:pl-0">
                {showNow && (
                  <p className="m-0 flex items-center gap-2 font-mono text-[.74rem] font-semibold tracking-[.06em] text-signal uppercase after:h-0.5 after:flex-1 after:bg-signal after:opacity-50 after:content-['']">
                    Сьогодні, {today.getDate()} {MONTH_NAMES_GENITIVE[tm]}
                  </p>
                )}
                {list.length ? (
                  list.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      past={!next}
                      canEdit={canEdit}
                      deleting={remove.isPending}
                      onDelete={() => remove.mutate(event.id)}
                    />
                  ))
                ) : (
                  <p className="m-0 py-[.55rem] font-mono text-[.8rem] text-ink-2 max-[759px]:py-0">Подій немає</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Button variant="ghost" className="mt-4" onClick={() => onViewChange(next ? ty : 'next')}>
        {next ? '← Попередні події' : 'До найближчих подій →'}
      </Button>
    </>
  );
}

export default function CalendarPage() {
  const { data: session } = useSession();
  const kurinId = session?.kurinId;
  const { data: events, isLoading, isError, error } = useKurinCalendar(kurinId);
  const canEdit = session?.role === 'ZVYAZKOVYI' || !!session?.isKurinniy;
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [today] = useState(() => new Date());
  const [view, setView] = useState<TimelineView>('next');

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження.'}</p>;
  if (!kurinId) return null;

  return (
    <div>
      <PageHeader
        title="Календарний план"
        subtitle={view === 'next' ? 'Збірки, табори та акції куреня на рік уперед' : `Що відбулося в ${view} році`}
        actions={
          canEdit && (
            <Button onClick={() => setAddEventOpen(true)}>
              + Додати подію
            </Button>
          )
        }
      />

      {canEdit && <AddEventDialog kurinId={kurinId} open={addEventOpen} onOpenChange={setAddEventOpen} />}

      <TimelineView events={events ?? []} kurinId={kurinId} canEdit={canEdit} today={today} view={view} onViewChange={setView} />
    </div>
  );
}
