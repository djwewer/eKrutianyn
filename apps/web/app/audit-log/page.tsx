'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useAuditLog, type AuditLogFilters } from '@/lib/queries/audit-log';
import { useUsers } from '@/lib/queries/users';
import { AUDIT_GROUP_LABELS, describeAuditEvent, auditGroupOf, type AuditGroup, type AuditLogItem } from '@/lib/audit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeading } from '@/components/ui/section-heading';
import { accessErrorMessage } from '@/lib/error-message';
import { nativeSelectClass } from '@/components/ui/native-select';

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
    <div>
      <PageHeader title="Журнал дій" subtitle="Хто що змінив у курені" crumb={{ href: '/settings', label: 'Налаштування' }} />

      <Card className="mb-4">
        <CardContent className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
          <div className="grid gap-[.3rem]">
            <Label htmlFor="audit-group">Тип дії</Label>
            <select
              id="audit-group"
              value={filters.group ?? ''}
              onChange={(e) => setFilter({ group: (e.target.value || undefined) as AuditGroup | undefined })}
              className={nativeSelectClass}
            >
              <option value="">Усі</option>
              {(Object.keys(AUDIT_GROUP_LABELS) as AuditGroup[]).map((group) => (
                <option key={group} value={group}>
                  {AUDIT_GROUP_LABELS[group]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-[.3rem]">
            <Label htmlFor="audit-from">Від</Label>
            <Input id="audit-from" type="date" value={filters.from ?? ''} onChange={(e) => setFilter({ from: e.target.value || undefined })} />
          </div>
          <div className="grid gap-[.3rem]">
            <Label htmlFor="audit-to">До</Label>
            <Input id="audit-to" type="date" value={filters.to ?? ''} onChange={(e) => setFilter({ to: e.target.value || undefined })} />
          </div>
          <div className="grid gap-[.3rem]">
            <Label htmlFor="audit-actor">Хто діяв</Label>
            <select
              id="audit-actor"
              value={filters.actorId ?? ''}
              onChange={(e) => setFilter({ actorId: e.target.value || undefined })}
              className={nativeSelectClass}
            >
              <option value="">Хто діяв: усі</option>
              {users.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nickname ? `${u.firstName} ${u.lastName} («${u.nickname}»)` : `${u.firstName} ${u.lastName}`}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {log.isLoading && <p>Завантаження...</p>}
      {log.isError && <p className="text-sm text-destructive">{accessErrorMessage(log.error) ?? 'Помилка завантаження.'}</p>}
      {log.isSuccess && items.length === 0 && (
        <p className="rounded-[6px] border-2 border-dashed border-line p-[1.2rem] text-center text-ink-2">Подій поки немає.</p>
      )}

      {groupByDay(items).map(({ day, items: dayItems }) => (
        <section key={day}>
          <SectionHeading>{day}</SectionHeading>
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[6px] border border-line bg-paper p-0">
            {dayItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-[.8rem] border-b border-dashed border-line px-[.9rem] py-[.65rem] last:border-b-0"
              >
                <span className="min-w-[3rem] font-mono text-[.82rem] text-ink-2">{timeLabel(item.createdAt)}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <b className="text-base leading-tight">{describeAuditEvent(item)}</b>
                  <small className="text-[.82rem] text-ink-2">{item.actor?.name ?? 'Система'}</small>
                </span>
                <Badge variant="mute">{AUDIT_GROUP_LABELS[auditGroupOf(item.action)]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {log.hasNextPage && (
        <Button variant="outline" className="mt-4 w-full" disabled={log.isFetchingNextPage} onClick={() => log.fetchNextPage()}>
          Завантажити ще
        </Button>
      )}
    </div>
  );
}
