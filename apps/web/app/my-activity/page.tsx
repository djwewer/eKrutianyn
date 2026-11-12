'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useJunakActivity, useCreateActivityEntry, useDeleteActivityEntry } from '@/lib/queries/junak-activity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeading } from '@/components/ui/section-heading';
import { RowList } from '@/components/ui/row-list';
import { formatEventDate } from '@/lib/calendar-timeline';
import { accessErrorMessage } from '@/lib/error-message';
import { nativeSelectClass } from '@/components/ui/native-select';

function AddEntryForm() {
  const [title, setTitle] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [role, setRole] = useState<'PARTICIPANT' | 'PROVID'>('PARTICIPANT');
  const [description, setDescription] = useState('');
  const create = useCreateActivityEntry();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Додати акцію</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-[.3rem]">
          <Label htmlFor="activity-title">Назва акції</Label>
          <Input
            id="activity-title"
            placeholder="Назва акції (напр. «Теренівка»)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid gap-[.3rem]">
          <Label htmlFor="activity-date">Дата</Label>
          <Input id="activity-date" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </div>
        <div className="grid gap-[.3rem]">
          <Label htmlFor="activity-role">Роль</Label>
          <select
            id="activity-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'PARTICIPANT' | 'PROVID')}
            className={nativeSelectClass}
          >
            <option value="PARTICIPANT">Я був(-ла) учасником</option>
            <option value="PROVID">Я був(-ла) в проводі</option>
          </select>
        </div>
        <div className="grid gap-[.3rem]">
          <Label htmlFor="activity-description">Що ти там робив(-ла)?</Label>
          <textarea
            id="activity-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Що ти там робив(-ла)?"
            className="min-h-[4.5rem] w-full min-w-0 resize-y rounded-[4px] border-2 border-line bg-field px-[.8rem] py-[.45rem] text-base leading-normal text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-navy focus-visible:outline-none"
          />
        </div>
        <div>
        <Button
          disabled={!title.trim() || create.isPending}
          onClick={() =>
            create.mutate(
              { title: title.trim(), occurredAt, role, description: description.trim() || undefined },
              {
                onSuccess: () => {
                  setTitle('');
                  setDescription('');
                },
              },
            )
          }
        >
          Додати
        </Button>
        </div>
        {create.isError && <p className="text-sm text-destructive">{accessErrorMessage(create.error) ?? 'Не вдалося додати.'}</p>}
      </CardContent>
    </Card>
  );
}

export default function MyActivityPage() {
  const { data: session } = useSession();
  const isJunak = session?.role === 'JUNAK';
  const { data: entries, isLoading, isError, error } = useJunakActivity(isJunak);
  const remove = useDeleteActivityEntry();

  if (!session) return null;
  if (!isJunak) return <p className="text-sm text-destructive">Немає доступу.</p>;
  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження.'}</p>;

  return (
    <div>
      <PageHeader
        title="Моя активність"
        subtitle="Ця сторінка ще у виробництві — поки що це вільний запис, згодом вигляд та можливості покращимо."
        crumb={{ href: '/plastuvannia', label: 'Моє пластування' }}
      />

      <AddEntryForm />

      <SectionHeading as="h2">Історія</SectionHeading>
      {(entries ?? []).length === 0 ? (
        <p className="rounded-[6px] border-2 border-dashed border-line p-[1.2rem] text-center text-ink-2">
          Ще немає жодного запису.
        </p>
      ) : (
        <RowList>
          {(entries ?? []).map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center gap-[.8rem] border-b border-dashed border-line px-[.9rem] py-[.65rem] last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 basis-48 flex-col gap-px">
                <span className="text-base leading-tight font-bold [overflow-wrap:anywhere]">{entry.title}</span>
                <span className="text-[.82rem] text-ink-2">
                  {formatEventDate(entry.occurredAt)} · {entry.role === 'PROVID' ? 'в проводі' : 'учасник'}
                </span>
                {entry.description && <span className="mt-1 text-sm [overflow-wrap:anywhere]">{entry.description}</span>}
              </div>
              <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(entry.id)}>
                Видалити
              </Button>
            </div>
          ))}
        </RowList>
      )}
    </div>
  );
}
