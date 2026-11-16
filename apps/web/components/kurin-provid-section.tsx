'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useKurinPositions, useAssignPosition, useRemovePosition } from '@/lib/queries/positions';
import { useUsers } from '@/lib/queries/users';
import { useSession } from '@/lib/session-client';
import { accessErrorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
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
    <div className="min-w-0 rounded-[6px] border border-line bg-background px-[.8rem] py-[.7rem]">
      <div className="flex items-center gap-[.7rem] text-sm">
        <Avatar initials={current ? getInitials(current.user.firstName, current.user.lastName) : '—'} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="w-full font-mono text-[.7rem] tracking-[.05em] text-ink-2 uppercase">{label}</span>
        {current ? (
          <>
            <b className="min-w-0 flex-1 text-[.98rem] leading-tight">
              <Link href={`/users/${current.user.id}`} className="rounded-[2px] hover:underline focus-visible:underline">
                {current.user.lastName} {current.user.firstName}
              </Link>
            </b>
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
              onValueChange={(value) => setSelectedUserId(value ?? '')}
              items={Object.fromEntries(candidates.map((c) => [c.id, `${c.lastName} ${c.firstName}`]))}
            >
              <SelectTrigger className="min-w-0 flex-1">
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
          <span className="flex-1 text-ink-2">— немає —</span>
        )}
        </div>
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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-[.6rem]">
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
    </div>
  );
}
