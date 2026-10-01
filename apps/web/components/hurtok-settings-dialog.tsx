'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accessErrorMessage } from '@/lib/error-message';
import { POSITION_LABELS } from '@/lib/role-labels';
import { useHurtky, useUpdateHurtok, useArchiveHurtok } from '@/lib/queries/hurtky';
import { useKurinPositions, useAssignPosition, useRemovePosition } from '@/lib/queries/positions';
import {
  useVykhovnykAssignments,
  useAssignVykhovnyk,
  useUnassignVykhovnyk,
} from '@/lib/queries/vykhovnyk-assignments';
import { useUsers } from '@/lib/queries/users';
import type { HurtokMember, PositionType } from '@/lib/types';

const HURTOK_POSITION_TYPES: PositionType[] = ['HURTKOVYI', 'SUDDIA', 'PYSAR', 'SKARBNYK'];

export function HurtokSettingsDialog({
  hurtok,
  members,
  open,
  onOpenChange,
}: {
  hurtok: { id: string; name: string; slug: string | null; foundedAt: string | null };
  members: HurtokMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [foundedAt, setFoundedAt] = useState(hurtok.foundedAt ? hurtok.foundedAt.slice(0, 10) : '');

  const updateHurtok = useUpdateHurtok(hurtok.id, hurtok.slug ?? undefined);
  const archiveHurtok = useArchiveHurtok(hurtok.id, hurtok.slug ?? undefined);

  const { data: allPositions, isLoading: positionsLoading } = useKurinPositions();
  const assignPosition = useAssignPosition();
  const removePosition = useRemovePosition();

  const { data: vykhovnykAssignments, isLoading: vykhovnykAssignmentsLoading } = useVykhovnykAssignments(hurtok.id);
  const { data: vykhovnykUsers, isLoading: vykhovnykUsersLoading } = useUsers({ role: 'VYKHOVNYK' });
  const assignVykhovnyk = useAssignVykhovnyk();
  const unassignVykhovnyk = useUnassignVykhovnyk();

  const { data: allHurtky, isLoading: hurtkyLoading } = useHurtky();
  const hurtokNameById = Object.fromEntries((allHurtky ?? []).map((h) => [h.id, h.name]));
  const positionSelectsDisabled = hurtkyLoading || positionsLoading;
  const vykhovnykSelectDisabled = vykhovnykAssignmentsLoading || vykhovnykUsersLoading;

  const junakMembers = members.filter((m) => m.role === 'JUNAK');
  const hurtokScopePositions = (allPositions ?? []).filter((p) => p.scope === 'HURTOK');
  const hurtokPositions = hurtokScopePositions.filter((p) => p.hurtokId === hurtok.id);
  const currentVykhovnykAssignment = (vykhovnykAssignments ?? [])[0];

  function invalidateHurtok() {
    queryClient.invalidateQueries({ queryKey: ['hurtky'] });
    queryClient.invalidateQueries({ queryKey: ['hurtky', 'by-slug', hurtok.slug] });
  }

  async function handleVykhovnykChange(newVykhovnykId: string) {
    if (currentVykhovnykAssignment) {
      await unassignVykhovnyk.mutateAsync(currentVykhovnykAssignment.id);
    }
    if (newVykhovnykId) {
      await assignVykhovnyk.mutateAsync({ vykhovnykId: newVykhovnykId, hurtokId: hurtok.id });
    }
    invalidateHurtok();
  }

  async function handleRemoveVykhovnyk() {
    if (!currentVykhovnykAssignment) return;
    await unassignVykhovnyk.mutateAsync(currentVykhovnykAssignment.id);
    invalidateHurtok();
  }

  async function handlePositionChange(positionType: PositionType, userId: string) {
    if (!userId) return;
    const conflicting = hurtokScopePositions.find((p) => p.user.id === userId);
    if (conflicting) {
      const candidate = junakMembers.find((m) => m.id === userId);
      const candidateName = candidate ? `${candidate.lastName} ${candidate.firstName}` : 'Цей юнак';
      const conflictingLabel = POSITION_LABELS[conflicting.positionType];
      const conflictingHurtokName = conflicting.hurtokId ? (hurtokNameById[conflicting.hurtokId] ?? '?') : '?';
      const confirmed = window.confirm(
        `${candidateName} вже займає посаду «${conflictingLabel}» у гуртку «${conflictingHurtokName}». ` +
          `Призначення автоматично зніме поточну посаду. Продовжити?`,
      );
      if (!confirmed) return;
    }
    await assignPosition.mutateAsync({ userId, scope: 'HURTOK', positionType, hurtokId: hurtok.id });
    invalidateHurtok();
  }

  async function handleRemovePosition(positionId: string) {
    await removePosition.mutateAsync(positionId);
    invalidateHurtok();
  }

  const canArchive = !members.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Налаштування гуртка</DialogTitle>

        <div className="space-y-2">
          <Label htmlFor="founded-at">Дата заснування</Label>
          <div className="flex gap-2">
            <Input
              id="founded-at"
              type="date"
              value={foundedAt}
              onChange={(e) => setFoundedAt(e.target.value)}
            />
            <Button
              size="sm"
              disabled={updateHurtok.isPending}
              onClick={() => updateHurtok.mutate({ foundedAt: foundedAt || null })}
            >
              Зберегти дату
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="vykhovnyk-select">Виховник</Label>
          <div className="flex gap-2">
            <select
              id="vykhovnyk-select"
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={currentVykhovnykAssignment?.vykhovnykId ?? ''}
              disabled={vykhovnykSelectDisabled}
              onChange={(e) => handleVykhovnykChange(e.target.value)}
            >
              <option value="">— немає —</option>
              {(vykhovnykUsers ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.lastName} {v.firstName}
                </option>
              ))}
            </select>
            {currentVykhovnykAssignment && (
              <Button size="sm" variant="outline" onClick={handleRemoveVykhovnyk}>
                Зняти
              </Button>
            )}
          </div>
        </div>

        {HURTOK_POSITION_TYPES.map((positionType) => {
          const current = hurtokPositions.find((p) => p.positionType === positionType);
          return (
            <div key={positionType} className="space-y-2" data-testid={`position-row-${positionType}`}>
              <Label htmlFor={`position-${positionType}`}>{POSITION_LABELS[positionType]}</Label>
              <div className="flex items-center gap-2">
                <select
                  id={`position-${positionType}`}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={current?.user.id ?? ''}
                  disabled={positionSelectsDisabled}
                  onChange={(e) => handlePositionChange(positionType, e.target.value)}
                >
                  <option value="">— немає —</option>
                  {junakMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.lastName} {m.firstName}
                    </option>
                  ))}
                </select>
                {current && (
                  <span className="whitespace-nowrap text-sm text-muted-foreground">
                    {current.user.lastName} {current.user.firstName}
                  </span>
                )}
                {current && (
                  <Button size="sm" variant="outline" onClick={() => handleRemovePosition(current.id)}>
                    Зняти
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <div className="space-y-2 border-t pt-4">
          <Button
            variant="outline"
            disabled={!canArchive || archiveHurtok.isPending}
            onClick={() => {
              if (window.confirm(`Архівувати гурток «${hurtok.name}»?`)) {
                archiveHurtok.mutate();
              }
            }}
          >
            Розформувати гурток
          </Button>
          {!canArchive && (
            <p className="text-sm text-muted-foreground">У гуртку ще є юнаки чи виховник — спершу зніміть їх.</p>
          )}
          {archiveHurtok.isError && (
            <p className="text-sm text-destructive">
              {accessErrorMessage(archiveHurtok.error) ?? 'Не вдалося архівувати гурток.'}
            </p>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Закрити
        </Button>
      </DialogContent>
    </Dialog>
  );
}
