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

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

// Events spanning multiple days (startDate..endDate) count on every day in
// that range, not just the start — a day in the middle of a camp should
// still show a dot.
function eventsOnDay(events: KurinCalendarEvent[], dayKey: string): KurinCalendarEvent[] {
  return events.filter((e) => {
    const start = toDateKey(e.startDate);
    const end = e.endDate ? toDateKey(e.endDate) : start;
    return dayKey >= start && dayKey <= end;
  });
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
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex gap-2">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input type="date" placeholder="Кінець (якщо декілька днів)" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Input
            placeholder="Опис (необов'язково)"
            autoComplete="off"
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

function MonthView({ events, kurinId, canEdit }: { events: KurinCalendarEvent[]; kurinId: string; canEdit: boolean }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const remove = useDeleteCalendarEvent(kurinId);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(cursor.year, cursor.month, 1);
    // Monday-first grid: JS getDay() is 0=Sunday, shift so Monday=0.
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

  const todayKey = new Date().toISOString().slice(0, 10);
  const selectedEvents = selectedDay ? eventsOnDay(events, selectedDay) : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}>
          ◂
        </Button>
        <CardTitle>
          {MONTH_NAMES[cursor.month]} {cursor.year}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}>
          ▸
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAY_NAMES.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            if (cell.day === 0) return <div key={cell.key} />;
            const dayEvents = eventsOnDay(events, cell.key);
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelectedDay(cell.key)}
                className={cn(
                  'flex aspect-square flex-col items-center justify-center rounded-md border border-border text-sm transition-colors hover:bg-accent-soft',
                  cell.key === todayKey && 'border-accent font-semibold text-accent-text',
                  cell.key === selectedDay && 'bg-accent-soft',
                )}
              >
                <span>{cell.day}</span>
                {dayEvents.length > 0 && <span className="mt-0.5 size-1.5 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>

        {selectedDay && (
          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <p className="text-sm font-medium">{selectedDay}</p>
            {selectedEvents.length === 0 && <p className="text-sm text-muted-foreground">Немає подій цього дня.</p>}
            {selectedEvents.map((event) => (
              <div key={event.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2">
                <div>
                  <p className="text-sm font-medium">{event.title}</p>
                  {event.description && <p className="text-xs text-muted-foreground">{event.description}</p>}
                </div>
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
              <div key={event.id} className="w-64 shrink-0 space-y-1 rounded-md border border-border p-3">
                <p className="text-xs font-semibold text-accent-text">
                  {new Date(event.startDate).toLocaleDateString('uk-UA')}
                  {event.endDate && ` – ${new Date(event.endDate).toLocaleDateString('uk-UA')}`}
                </p>
                <p className="text-sm font-medium">{event.title}</p>
                {event.description && <p className="text-xs text-muted-foreground">{event.description}</p>}
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
  const [view, setView] = useState<'timeline' | 'month'>('timeline');
  const [addEventOpen, setAddEventOpen] = useState(false);

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження.'}</p>;
  if (!kurinId) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Календарний план</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-md border border-border p-1">
            <Button size="sm" variant={view === 'timeline' ? 'default' : 'ghost'} onClick={() => setView('timeline')}>
              Таймлайн
            </Button>
            <Button size="sm" variant={view === 'month' ? 'default' : 'ghost'} onClick={() => setView('month')}>
              Місяць
            </Button>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setAddEventOpen(true)}>
              + Додати подію
            </Button>
          )}
        </div>
      </div>

      {canEdit && <AddEventDialog kurinId={kurinId} open={addEventOpen} onOpenChange={setAddEventOpen} />}

      {view === 'timeline' ? (
        <TimelineView events={events ?? []} kurinId={kurinId} canEdit={canEdit} />
      ) : (
        <MonthView events={events ?? []} kurinId={kurinId} canEdit={canEdit} />
      )}
    </div>
  );
}
