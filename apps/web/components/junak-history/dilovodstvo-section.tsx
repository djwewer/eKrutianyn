'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddPastPosition, useRemovePastPosition, useUpdatePastPosition } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
import { POSITION_SCOPE_LABELS, formatYears } from '@/lib/history-labels';
import { POSITION_LABELS } from '@/lib/role-labels';
import type { JunakPastPosition, JunakPositionHistory, PositionScope } from '@/lib/types';
import { DialogActions, EmptyText, HistoryCard, RowActions } from './shared';

interface DilovodstvoRow {
  key: string;
  title: string;
  context: string;
  period: string;
  current: boolean;
  sortYear: number;
  past?: JunakPastPosition;
}

/** Current positions first, then everything else by start year, newest first. */
function buildRows(positions: JunakPositionHistory[], pastPositions: JunakPastPosition[]): DilovodstvoRow[] {
  const fromApp: DilovodstvoRow[] = positions.map((p) => {
    const from = new Date(p.assignedAt).getUTCFullYear();
    return {
      key: p.id,
      title: POSITION_LABELS[p.positionType],
      context: p.scope === 'HURTOK' ? `гурток «${p.hurtokName ?? '—'}»` : 'курінь',
      period: `${from}–${p.removedAt ? new Date(p.removedAt).getUTCFullYear() : 'дотепер'}`,
      current: p.removedAt === null,
      sortYear: from,
    };
  });
  const archived: DilovodstvoRow[] = pastPositions.map((p) => ({
    key: p.id,
    title: p.title,
    context: POSITION_SCOPE_LABELS[p.scope],
    period: formatYears(p.yearFrom, p.yearTo),
    current: false,
    sortYear: p.yearFrom,
    past: p,
  }));
  return [...fromApp, ...archived].sort((a, b) => Number(b.current) - Number(a.current) || b.sortYear - a.sortYear);
}

export function DilovodstvoSection({
  junakId,
  positions,
  pastPositions,
  canEdit,
}: {
  junakId: string;
  positions: JunakPositionHistory[];
  pastPositions: JunakPastPosition[];
  canEdit: boolean;
}) {
  const [dialog, setDialog] = useState<{ entry: JunakPastPosition | null } | null>(null);
  const remove = useRemovePastPosition(junakId);
  const rows = buildRows(positions, pastPositions);
  return (
    <HistoryCard
      title="Діловодство"
      testId="history-dilovodstvo"
      addLabel="Додати посаду"
      onAdd={canEdit ? () => setDialog({ entry: null }) : undefined}
    >
      {rows.length === 0 ? (
        <EmptyText>Посад ще не було.</EmptyText>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
                <span className="font-medium">{row.title}</span>
                <span className="text-muted-foreground">
                  {row.context}, {row.period}
                </span>
                {row.current && <Badge>зараз</Badge>}
                {row.past && <Badge variant="neutral">до застосунку</Badge>}
              </span>
              {canEdit && row.past && (
                <RowActions
                  label={row.title}
                  onEdit={() => setDialog({ entry: row.past! })}
                  onDelete={() => remove.mutate(row.past!.id)}
                  disabled={remove.isPending}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.isError && <p className="text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити запис.')}</p>}
      {dialog && <PastPositionDialog junakId={junakId} entry={dialog.entry} onClose={() => setDialog(null)} />}
    </HistoryCard>
  );
}

function PastPositionDialog({ junakId, entry, onClose }: { junakId: string; entry: JunakPastPosition | null; onClose: () => void }) {
  const add = useAddPastPosition(junakId);
  const update = useUpdatePastPosition(junakId);
  const mutation = entry ? update : add;
  const currentYear = new Date().getUTCFullYear();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [scope, setScope] = useState<PositionScope>(entry?.scope ?? 'HURTOK');
  const [yearFrom, setYearFrom] = useState(entry ? String(entry.yearFrom) : '');
  const [yearTo, setYearTo] = useState(entry?.yearTo ? String(entry.yearTo) : '');

  const from = Number(yearFrom);
  const to = yearTo ? Number(yearTo) : null;
  const yearsValid =
    Number.isInteger(from) && from >= 1990 && from <= currentYear && (to === null || (Number.isInteger(to) && to >= from && to <= currentYear));

  function submit() {
    const dto = { title: title.trim(), scope, yearFrom: from, yearTo: to };
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
        <DialogTitle>{entry ? 'Змінити запис архіву' : 'Посада до застосунку'}</DialogTitle>
        <div className="space-y-2">
          <Label htmlFor="past-position-title">Посада</Label>
          <Input
            id="past-position-title"
            placeholder="Гуртковий, курінний суддя…"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="past-position-scope">Де</Label>
          <select
            id="past-position-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as PositionScope)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="HURTOK">У гуртку</option>
            <option value="KURIN">У курені</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="past-position-year-from">Рік початку</Label>
            <Input
              id="past-position-year-from"
              type="number"
              inputMode="numeric"
              min={1990}
              max={currentYear}
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="past-position-year-to">Рік завершення (необовʼязково)</Label>
            <Input
              id="past-position-year-to"
              type="number"
              inputMode="numeric"
              min={1990}
              max={currentYear}
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
            />
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти запис.')}</p>
        )}
        {!yearsValid && yearFrom && (
          <p className="text-sm text-destructive">Роки мають бути від 1990 до поточного, а рік завершення — не раніше року початку.</p>
        )}
        <DialogActions onCancel={onClose} onSubmit={submit} disabled={!title.trim() || !yearsValid || mutation.isPending} />
      </DialogContent>
    </Dialog>
  );
}
