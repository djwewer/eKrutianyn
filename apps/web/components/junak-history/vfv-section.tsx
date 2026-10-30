'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddVfv, useRemoveVfv, useUpdateVfv } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
import type { JunakVfv } from '@/lib/types';
import { DialogActions, EmptyText, HistoryCard, RowActions, formatDate, today } from './shared';

export function VfvSection({ junakId, entries, canEdit }: { junakId: string; entries: JunakVfv[]; canEdit: boolean }) {
  const [dialog, setDialog] = useState<{ entry: JunakVfv | null } | null>(null);
  const remove = useRemoveVfv(junakId);
  return (
    <HistoryCard
      title="ВФВ"
      testId="history-vfv"
      addLabel="Додати ВФВ"
      onAdd={canEdit ? () => setDialog({ entry: null }) : undefined}
    >
      {entries.length === 0 ? (
        <EmptyText>Записів про ВФВ ще немає.</EmptyText>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const dateLabel = entry.achievedAt ? formatDate(entry.achievedAt) : 'Дата не вказана';
            return (
              <li key={entry.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-medium">{dateLabel}</span>
                  {entry.note && <span className="block text-muted-foreground [overflow-wrap:anywhere]">{entry.note}</span>}
                </span>
                {canEdit && (
                  <RowActions
                    label={`ВФВ, ${dateLabel}`}
                    onEdit={() => setDialog({ entry })}
                    onDelete={() => remove.mutate(entry.id)}
                    disabled={remove.isPending}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {remove.isError && <p className="text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити запис.')}</p>}
      {dialog && <VfvDialog junakId={junakId} entry={dialog.entry} onClose={() => setDialog(null)} />}
    </HistoryCard>
  );
}

function VfvDialog({ junakId, entry, onClose }: { junakId: string; entry: JunakVfv | null; onClose: () => void }) {
  const add = useAddVfv(junakId);
  const update = useUpdateVfv(junakId);
  const mutation = entry ? update : add;
  const [achievedAt, setAchievedAt] = useState(entry?.achievedAt ?? '');
  const [note, setNote] = useState(entry?.note ?? '');

  function submit() {
    const dto = { achievedAt: achievedAt || null, note: note.trim() || null };
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
        <DialogTitle>{entry ? 'Змінити запис ВФВ' : 'Додати ВФВ'}</DialogTitle>
        <div className="space-y-2">
          <Label htmlFor="vfv-date">Дата (необовʼязково)</Label>
          <Input id="vfv-date" type="date" max={today()} value={achievedAt} onChange={(e) => setAchievedAt(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vfv-note">Примітка (необовʼязково)</Label>
          <Input id="vfv-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти запис.')}</p>
        )}
        <DialogActions onCancel={onClose} onSubmit={submit} disabled={mutation.isPending} />
      </DialogContent>
    </Dialog>
  );
}
