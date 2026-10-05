'use client';

import { useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useKurinCalendar, useCreateCalendarEvent, useDeleteCalendarEvent } from '@/lib/queries/kurin-calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { accessErrorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import type { KurinCalendarEvent } from '@/lib/types';

const MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];
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

function TimelineView({ events, kurinId, canEdit }: { events: KurinCalendarEvent[]; kurinId: string; canEdit: boolean }) {
  const remove = useDeleteCalendarEvent(kurinId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => [...events].sort((a, b) => a.startDate.localeCompare(b.startDate)), [events]);

  function scrollBy(amount: number) {
    scrollRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Таймлайн на рік</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => scrollBy(-320)}>
            ◂
          </Button>
          <Button size="sm" variant="outline" onClick={() => scrollBy(320)}>
            ▸
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? 'Наразі немає подій. Ви можете додати нову, натиснувши кнопку «Додати подію».'
              : 'Наразі немає подій.'}
          </p>
        ) : (
          <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2">
            {sorted.map((event) => (
              <div key={event.id} className="w-64 shrink-0 space-y-1 overflow-hidden rounded-md border border-border p-3">
                <p className="text-xs font-semibold text-accent-text">
                  {new Date(event.startDate).toLocaleDateString('uk-UA')}
                  {event.endDate && ` – ${new Date(event.endDate).toLocaleDateString('uk-UA')}`}
                </p>
                <p className="text-sm font-medium break-words">{event.title}</p>
                {event.description && <p className="text-xs break-words text-muted-foreground">{event.description}</p>}
                {canEdit && (
                  <Button size="sm" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate(event.id)}>
                    Видалити
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CalendarPage() {
  const { data: session } = useSession();
  const kurinId = session?.kurinId;
  const { data: events, isLoading, isError, error } = useKurinCalendar(kurinId);
  const canEdit = session?.role === 'ZVYAZKOVYI' || !!session?.isKurinniy;
  const [addEventOpen, setAddEventOpen] = useState(false);

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження.'}</p>;
  if (!kurinId) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Календарний план</h1>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setAddEventOpen(true)}>
            + Додати подію
          </Button>
        )}
      </div>

      {canEdit && <AddEventDialog kurinId={kurinId} open={addEventOpen} onOpenChange={setAddEventOpen} />}

      <TimelineView events={events ?? []} kurinId={kurinId} canEdit={canEdit} />
    </div>
  );
}
