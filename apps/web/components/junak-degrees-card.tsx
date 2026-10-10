'use client';

import { useState } from 'react';
import { useJunakDegrees, useSetDegreeDate } from '@/lib/queries/junak-degrees';
import { accessErrorMessage } from '@/lib/error-message';
import { ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DegreeKey } from '@/lib/types';

export const DEGREE_LABELS: Record<DegreeKey, string> = {
  PRYHYLNYK: 'Прихильник',
  UCHASNYK: 'Учасник',
  ROZVIDUVACH: 'Розвідувач',
  SKOB: 'Скоб',
};

const DEGREE_ORDER: DegreeKey[] = ['PRYHYLNYK', 'UCHASNYK', 'ROZVIDUVACH', 'SKOB'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.status !== 403) {
    const message = (error.body as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message) return message;
  }
  return accessErrorMessage(error) ?? 'Не вдалося зберегти дату.';
}

function DegreeRow({
  degreeKey,
  date,
  canEdit,
  junakId,
}: {
  degreeKey: DegreeKey;
  date: string | null;
  canEdit: boolean;
  junakId: string;
}) {
  const setDate = useSetDegreeDate(junakId);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(date ?? '');
  const isSkob = degreeKey === 'SKOB';

  function startEditing() {
    setDraft(date ?? '');
    setDate.reset();
    setIsEditing(true);
  }

  return (
    <li className="space-y-1 border-b py-2 text-sm last:border-b-0" data-testid={`degree-${degreeKey}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{DEGREE_LABELS[degreeKey]}</span>
        {isEditing ? (
          <span className="flex items-center gap-2">
            <Input
              type="date"
              aria-label={`Дата здобуття ступеня «${DEGREE_LABELS[degreeKey]}»`}
              value={draft}
              max={today()}
              onChange={(e) => setDraft(e.target.value)}
              className="w-40"
            />
            <Button
              size="sm"
              disabled={!draft || setDate.isPending}
              onClick={() =>
                setDate.mutate({ key: degreeKey, date: draft }, { onSuccess: () => setIsEditing(false) })
              }
            >
              Зберегти
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
              Скасувати
            </Button>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className={date ? '' : 'text-muted-foreground'}>{date ? formatDate(date) : '—'}</span>
            {canEdit && (date || isSkob) && (
              <Button size="sm" variant="outline" onClick={startEditing}>
                {date ? 'Змінити дату' : 'Вказати дату'}
              </Button>
            )}
            {canEdit && isSkob && date && (
              <Button
                size="sm"
                variant="outline"
                disabled={setDate.isPending}
                onClick={() => setDate.mutate({ key: 'SKOB', date: null })}
              >
                Прибрати
              </Button>
            )}
          </span>
        )}
      </div>
      {!date && !isSkob && (
        <p className="text-xs text-muted-foreground">Дата зʼявиться, коли буде закрито відповідну пробу.</p>
      )}
      {setDate.isError && <p className="text-sm text-destructive">{errorText(setDate.error)}</p>}
    </li>
  );
}

/** Current degree and the date each degree was earned (Прихильник → Учасник → Розвідувач → Скоб). */
export function JunakDegreesCard({ junakId, canEdit }: { junakId: string; canEdit: boolean }) {
  const { data, isError, error } = useJunakDegrees(junakId);
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ступінь</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження ступенів.'}</p>
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ступінь</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="flex items-center gap-2 text-sm">
          Поточний ступінь:{' '}
          {data.currentLabel ? (
            <Badge data-testid="current-degree">{data.currentLabel}</Badge>
          ) : (
            <span className="text-muted-foreground" data-testid="current-degree">
              ще не здобуто
            </span>
          )}
        </p>
        <ul>
          {DEGREE_ORDER.map((key) => (
            <DegreeRow key={key} degreeKey={key} date={data.dates[key]} canEdit={canEdit} junakId={junakId} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
