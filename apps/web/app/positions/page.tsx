'use client';

import { useState } from 'react';
import { useKurinPositions, useAssignPosition, useRemovePosition } from '@/lib/queries/positions';
import { useHurtky } from '@/lib/queries/hurtky';
import { useUsers } from '@/lib/queries/users';
import { accessErrorMessage } from '@/lib/error-message';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { KurinPosition, PositionScope, PositionType } from '@/lib/types';

const KURIN_POSITION_TYPES: { value: PositionType; label: string }[] = [
  { value: 'KURINNYI', label: 'Курінний' },
  { value: 'SUDDIA', label: 'Суддя' },
  { value: 'PYSAR', label: 'Писар' },
  { value: 'SKARBNYK', label: 'Скарбник' },
  { value: 'INTENDANT', label: 'Інтендант' },
  { value: 'KHORUNZHYI', label: 'Хорунжий' },
  { value: 'SMM', label: 'СММник' },
];

const HURTOK_POSITION_TYPES: { value: PositionType; label: string }[] = [
  { value: 'HURTKOVYI', label: 'Гуртковий' },
  { value: 'SUDDIA', label: 'Суддя' },
  { value: 'PYSAR', label: 'Писар' },
  { value: 'SKARBNYK', label: 'Скарбник' },
];

function PositionSlot({
  label,
  positionType,
  scope,
  hurtokId,
  current,
  candidates,
}: {
  label: string;
  positionType: PositionType;
  scope: PositionScope;
  hurtokId?: string;
  current: KurinPosition | undefined;
  candidates: { id: string; firstName: string; lastName: string }[];
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const assign = useAssignPosition();
  const remove = useRemovePosition();

  const assignErrorMsg = assign.isError ? (accessErrorMessage(assign.error) ?? 'Помилка при призначенні.') : null;
  const removeErrorMsg = remove.isError ? (accessErrorMessage(remove.error) ?? 'Помилка при зняттю.') : null;

  return (
    <div className="border-b py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="w-32 shrink-0 font-medium">{label}</span>
        {current ? (
          <>
            <span className="flex-1">
              {current.user.lastName} {current.user.firstName}
            </span>
            <Button variant="outline" size="sm" onClick={() => remove.mutate(current.id)} disabled={remove.isPending}>
              Зняти
            </Button>
          </>
        ) : (
          <>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 rounded-md border px-2 py-1 text-sm"
            >
              <option value="">Оберіть юнака</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.lastName} {c.firstName}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!selectedUserId || assign.isPending}
              onClick={() =>
                assign.mutate({ userId: selectedUserId, scope, positionType, hurtokId }, { onSuccess: () => setSelectedUserId('') })
              }
            >
              Призначити
            </Button>
          </>
        )}
      </div>
      {assignErrorMsg && <p className="mt-1 text-xs text-destructive">{assignErrorMsg}</p>}
      {removeErrorMsg && <p className="mt-1 text-xs text-destructive">{removeErrorMsg}</p>}
    </div>
  );
}

export default function PositionsPage() {
  const { data: positions, isLoading: positionsLoading, isError: positionsError, error: positionsErrorObj } = useKurinPositions();
  const { data: hurtky, isLoading: hurtkyLoading, isError: hurtkyError, error: hurtkyErrorObj } = useHurtky();
  const { data: junaky } = useUsers({ role: 'JUNAK' });

  if (positionsLoading || hurtkyLoading) return <p>Завантаження...</p>;
  if (positionsError) return <p className="text-sm text-destructive">{accessErrorMessage(positionsErrorObj) ?? 'Помилка завантаження посад куреня.'}</p>;
  if (hurtkyError) return <p className="text-sm text-destructive">{accessErrorMessage(hurtkyErrorObj) ?? 'Помилка завантаження гуртків.'}</p>;

  const candidates = junaky ?? [];
  const kurinPositions = positions ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Діловоди</h1>

      <Card>
        <CardHeader>
          <CardTitle>Посади куреня</CardTitle>
        </CardHeader>
        <CardContent>
          {KURIN_POSITION_TYPES.map((p) => (
            <PositionSlot
              key={p.value}
              label={p.label}
              positionType={p.value}
              scope="KURIN"
              current={kurinPositions.find((kp) => kp.scope === 'KURIN' && kp.positionType === p.value)}
              candidates={candidates}
            />
          ))}
        </CardContent>
      </Card>

      {(hurtky ?? []).map((h) => (
        <Card key={h.id}>
          <CardHeader>
            <CardTitle>Посади гуртка &laquo;{h.name}&raquo;</CardTitle>
          </CardHeader>
          <CardContent>
            {HURTOK_POSITION_TYPES.map((p) => (
              <PositionSlot
                key={p.value}
                label={p.label}
                positionType={p.value}
                scope="HURTOK"
                hurtokId={h.id}
                current={kurinPositions.find(
                  (kp) => kp.scope === 'HURTOK' && kp.hurtokId === h.id && kp.positionType === p.value,
                )}
                candidates={candidates.filter((c) => c.hurtokId === h.id)}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
