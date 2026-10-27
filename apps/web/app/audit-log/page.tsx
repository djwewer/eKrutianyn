'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useAuditLog, type AuditLogFilters } from '@/lib/queries/audit-log';
import { useUsers } from '@/lib/queries/users';
import { AUDIT_GROUP_LABELS, describeAuditEvent, type AuditGroup, type AuditLogItem } from '@/lib/audit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accessErrorMessage } from '@/lib/error-message';

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function groupByDay(items: AuditLogItem[]): { day: string; items: AuditLogItem[] }[] {
  const days: { day: string; items: AuditLogItem[] }[] = [];
  for (const item of items) {
    const day = dayLabel(item.createdAt);
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }
  return days;
}

export default function AuditLogPage() {
  const { data: session } = useSession();
  const isZvyazkovyi = session?.role === 'ZVYAZKOVYI';
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const users = useUsers({}, { enabled: isZvyazkovyi });
  const log = useAuditLog(session?.kurinId, filters, { enabled: isZvyazkovyi });

  if (!session) return <p>Завантаження...</p>;
  if (!isZvyazkovyi) return <p className="text-sm text-muted-foreground">Немає доступу.</p>;

  const setFilter = (patch: Partial<AuditLogFilters>) => setFilters((prev) => ({ ...prev, ...patch }));
  const items = log.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Журнал дій</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={filters.group ? 'outline' : 'default'} onClick={() => setFilter({ group: undefined })}>
          Усі
        </Button>
        {(Object.keys(AUDIT_GROUP_LABELS) as AuditGroup[]).map((group) => (
          <Button
            key={group}
            size="sm"
            variant={filters.group === group ? 'default' : 'outline'}
            onClick={() => setFilter({ group })}
          >
            {AUDIT_GROUP_LABELS[group]}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" aria-label="Від" value={filters.from ?? ''} onChange={(e) => setFilter({ from: e.target.value || undefined })} className="max-w-40" />
        <Input type="date" aria-label="До" value={filters.to ?? ''} onChange={(e) => setFilter({ to: e.target.value || undefined })} className="max-w-40" />
        <select
          aria-label="Хто діяв"
          value={filters.actorId ?? ''}
          onChange={(e) => setFilter({ actorId: e.target.value || undefined })}
          className="rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none dark:bg-input/30"
        >
          <option value="">Хто діяв: усі</option>
          {users.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nickname ? `${u.firstName} ${u.lastName} («${u.nickname}»)` : `${u.firstName} ${u.lastName}`}
            </option>
          ))}
        </select>
      </div>

      {log.isLoading && <p>Завантаження...</p>}
      {log.isError && <p className="text-sm text-destructive">{accessErrorMessage(log.error) ?? 'Помилка завантаження.'}</p>}
      {log.isSuccess && items.length === 0 && <p className="text-sm text-muted-foreground">Подій поки немає.</p>}

      {groupByDay(items).map(({ day, items: dayItems }) => (
        <Card key={day}>
          <CardContent className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{day}</h2>
            <ul className="space-y-1.5">
              {dayItems.map((item) => (
                <li key={item.id} className="text-sm">
                  <span className="text-muted-foreground">{timeLabel(item.createdAt)}</span> · <span className="font-medium">{item.actor?.name ?? 'Система'}</span> ·{' '}
                  {describeAuditEvent(item)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {log.hasNextPage && (
        <Button variant="outline" disabled={log.isFetchingNextPage} onClick={() => log.fetchNextPage()}>
          Завантажити ще
        </Button>
      )}
    </div>
  );
}
