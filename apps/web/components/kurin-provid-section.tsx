'use client';

import { useState } from 'react';
import { useKurinPositions, useAssignPosition, useRemovePosition } from '@/lib/queries/positions';
import { useUsers } from '@/lib/queries/users';
import { useSession } from '@/lib/session-client';
import { accessErrorMessage } from '@/lib/error-message';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { KurinPosition, PositionType } from '@/lib/types';

const KURIN_POSITION_TYPES: { value: PositionType; label: string }[] = [
  { value: 'KURINNYI', label: 'Курінний' },
  { value: 'SUDDIA', label: 'Суддя' },
  { value: 'PYSAR', label: 'Писар' },
  { value: 'SKARBNYK', label: 'Скарбник' },
  { value: 'INTENDANT', label: 'Інтендант' },
  { value: 'KHORUNZHYI', label: 'Хорунжий' },
  { value: 'SMM', label: 'СММник' },
];

const POSITION_TYPE_LABELS: Record<PositionType, string> = {
  KURINNYI: 'Курінний',
  SUDDIA: 'Суддя',
  PYSAR: 'Писар',
  SKARBNYK: 'Скарбник',
  INTENDANT: 'Інтендант',
  KHORUNZHYI: 'Хорунжий',
  SMM: 'СММник',
  HURTKOVYI: 'Гуртковий',
};

function ProvidSlot({
  label,
  positionType,
  current,
  candidates,
  positionsInScope,
  canEdit,
}: {
  label: string;
  positionType: PositionType;
  current: KurinPosition | undefined;
  candidates: { id: string; firstName: string; lastName: string }[];
  positionsInScope: KurinPosition[];
  canEdit: boolean;
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
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => remove.mutate(current.id)} disabled={remove.isPending}>
                Зняти
              </Button>
            )}
          </>
        ) : canEdit ? (
          <>
            <Select
              value={selectedUserId || null}
              onValueChange={(value) => setSelectedUserId((value as string | null) ?? '')}
              items={Object.fromEntries(candidates.map((c) => [c.id, `${c.lastName} ${c.firstName}`]))}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Оберіть юнака" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.lastName} {c.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!selectedUserId || assign.isPending}
              onClick={() => {
                const conflicting = positionsInScope.find((kp) => kp.user.id === selectedUserId);
                if (conflicting) {
                  const candidate = candidates.find((c) => c.id === selectedUserId);
                  const candidateName = candidate ? `${candidate.lastName} ${candidate.firstName}` : 'Цей юнак';
                  const conflictingLabel = POSITION_TYPE_LABELS[conflicting.positionType];
                  const confirmed = window.confirm(
                    `${candidateName} вже займає посаду «${conflictingLabel}». ` +
                      `Призначення на «${label}» автоматично зніме поточну посаду. Продовжити?`,
                  );
                  if (!confirmed) return;
                }
                assign.mutate({ userId: selectedUserId, scope: 'KURIN', positionType }, { onSuccess: () => setSelectedUserId('') });
              }}
            >
              Призначити
            </Button>
          </>
        ) : (
          <span className="flex-1 text-muted-foreground">— немає —</span>
        )}
      </div>
      {assignErrorMsg && <p className="mt-1 text-xs text-destructive">{assignErrorMsg}</p>}
      {removeErrorMsg && <p className="mt-1 text-xs text-destructive">{removeErrorMsg}</p>}
    </div>
  );
}

export function KurinProvidSection() {
  const { data: session } = useSession();
  const { data: positions, isLoading: positionsLoading, isError: positionsError, error: positionsErrorObj } = useKurinPositions();
  const { data: junaky, isLoading: junakyLoading } = useUsers({ role: 'JUNAK' });

  if (positionsLoading || junakyLoading) return <p>Завантаження...</p>;
  if (positionsError) return <p className="text-sm text-destructive">{accessErrorMessage(positionsErrorObj) ?? 'Помилка завантаження посад куреня.'}</p>;

  const candidates = junaky ?? [];
  const kurinPositions = (positions ?? []).filter((p) => p.scope === 'KURIN');

  function canEditSlot(positionType: PositionType) {
    if (session?.role === 'ZVYAZKOVYI') return true;
    if (session?.isKurinniy) return positionType !== 'KURINNYI';
    return false;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Провід куреня</CardTitle>
      </CardHeader>
      <CardContent>
        {KURIN_POSITION_TYPES.map((p) => (
          <ProvidSlot
            key={p.value}
            label={p.label}
            positionType={p.value}
            current={kurinPositions.find((kp) => kp.positionType === p.value)}
            candidates={candidates}
            positionsInScope={kurinPositions}
            canEdit={canEditSlot(p.value)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
