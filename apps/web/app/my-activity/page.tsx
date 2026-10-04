'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useJunakActivity, useCreateActivityEntry, useDeleteActivityEntry } from '@/lib/queries/junak-activity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accessErrorMessage } from '@/lib/error-message';

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
      <CardContent className="space-y-2">
        <Input placeholder="Назва акції (напр. «Теренівка»)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'PARTICIPANT' | 'PROVID')}
          className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none dark:bg-input/30"
        >
          <option value="PARTICIPANT">Я був(-ла) учасником</option>
          <option value="PROVID">Я був(-ла) в проводі</option>
        </select>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Що ти там робив(-ла)?"
          className="w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <Button
          size="sm"
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
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Моя активність</h1>
        <p className="text-xs text-muted-foreground">
          Ця сторінка ще у виробництві — поки що це вільний запис, згодом вигляд та можливості покращимо.
        </p>
      </div>

      <AddEntryForm />

      <Card>
        <CardHeader>
          <CardTitle>Історія</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(entries ?? []).length === 0 && <p className="text-sm text-muted-foreground">Ще немає жодного запису.</p>}
          {(entries ?? []).map((entry) => (
            <div key={entry.id} className="space-y-1 rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{entry.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.occurredAt).toLocaleDateString('uk-UA')} ·{' '}
                    {entry.role === 'PROVID' ? 'в проводі' : 'учасник'}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate(entry.id)}>
                  Видалити
                </Button>
              </div>
              {entry.description && <p className="text-sm">{entry.description}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
