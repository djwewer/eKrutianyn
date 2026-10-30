'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddCamp, useRemoveCamp, useUpdateCamp } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
import { CAMP_ROLE_LABELS, formatYears } from '@/lib/history-labels';
import type { JunakActivityRole, JunakCamp } from '@/lib/types';
import { DialogActions, EmptyText, HistoryCard, RowActions } from './shared';

export function CampsSection({ junakId, entries, canEdit }: { junakId: string; entries: JunakCamp[]; canEdit: boolean }) {
  const [dialog, setDialog] = useState<{ entry: JunakCamp | null } | null>(null);
  const remove = useRemoveCamp(junakId);
  return (
    <HistoryCard
      title="Табори"
      testId="history-camps"
      addLabel="Додати табір"
      onAdd={canEdit ? () => setDialog({ entry: null }) : undefined}
    >
      {entries.length === 0 ? (
        <EmptyText>Таборів ще немає.</EmptyText>
      ) : (
        <ul className="space-y-2">
          {entries.map((camp) => (
            <li key={camp.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {camp.name}, {formatYears(camp.yearFrom, camp.yearTo)}, {CAMP_ROLE_LABELS[camp.role]}
              </span>
              {canEdit && (
                <RowActions
                  label={camp.name}
                  onEdit={() => setDialog({ entry: camp })}
                  onDelete={() => remove.mutate(camp.id)}
                  disabled={remove.isPending}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.isError && <p className="text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити табір.')}</p>}
      {dialog && <CampDialog junakId={junakId} entry={dialog.entry} onClose={() => setDialog(null)} />}
    </HistoryCard>
  );
}

function CampDialog({ junakId, entry, onClose }: { junakId: string; entry: JunakCamp | null; onClose: () => void }) {
  const add = useAddCamp(junakId);
  const update = useUpdateCamp(junakId);
  const mutation = entry ? update : add;
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState(entry?.name ?? '');
  const [yearFrom, setYearFrom] = useState(entry ? String(entry.yearFrom) : String(currentYear));
  const [yearTo, setYearTo] = useState(entry?.yearTo ? String(entry.yearTo) : '');
  const [role, setRole] = useState<JunakActivityRole>(entry?.role ?? 'PARTICIPANT');

  const from = Number(yearFrom);
  const to = yearTo ? Number(yearTo) : null;
  const yearsValid =
    Number.isInteger(from) && from >= 1990 && from <= currentYear && (to === null || (Number.isInteger(to) && to >= from && to <= currentYear));

  function submit() {
    const dto = { name: name.trim(), yearFrom: Number(yearFrom), yearTo: yearTo ? Number(yearTo) : null, role };
    if (entry) update.mutate({ id: entry.id, ...dto }, { onSuccess: onClose });
    else add.mutate(dto, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{entry ? 'Змінити табір' : 'Додати табір'}</DialogTitle>
        <div className="space-y-2">
          <Label htmlFor="camp-name">Назва табору</Label>
          <Input id="camp-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="camp-year-from">Рік початку</Label>
            <Input
              id="camp-year-from"
              type="number"
              inputMode="numeric"
              min={1990}
              max={currentYear}
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="camp-year-to">Рік завершення (необовʼязково)</Label>
            <Input
              id="camp-year-to"
              type="number"
              inputMode="numeric"
              min={1990}
              max={currentYear}
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="camp-role">Роль</Label>
          <select
            id="camp-role"
            value={role}
            onChange={(e) => setRole(e.target.value as JunakActivityRole)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="PARTICIPANT">Учасник</option>
            <option value="PROVID">Провід</option>
          </select>
        </div>
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти табір.')}</p>
        )}
        {!yearsValid && yearFrom && (
          <p className="text-sm text-destructive">Роки мають бути від 1990 до поточного, а рік завершення — не раніше року початку.</p>
        )}
        <DialogActions onCancel={onClose} onSubmit={submit} disabled={!name.trim() || !yearsValid || mutation.isPending} />
      </DialogContent>
    </Dialog>
  );
}
