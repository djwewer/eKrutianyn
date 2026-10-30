'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddRemark, useRemoveRemark, useUpdateRemark } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
import { REMARK_KIND_LABELS } from '@/lib/history-labels';
import type { JunakRemark, JunakRemarkKind } from '@/lib/types';
import { DialogActions, EmptyText, HistoryCard, RowActions, formatDate, today } from './shared';

const TEXTAREA = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm';

export function RemarksSection({ junakId, entries, canEdit }: { junakId: string; entries: JunakRemark[]; canEdit: boolean }) {
  const [dialog, setDialog] = useState<{ entry: JunakRemark | null } | null>(null);
  const remove = useRemoveRemark(junakId);
  return (
    <HistoryCard
      title="Відзначення та перестороги"
      testId="history-remarks"
      addLabel="Додати запис"
      onAdd={canEdit ? () => setDialog({ entry: null }) : undefined}
    >
      {entries.length === 0 ? (
        <EmptyText>Відзначень і пересторог немає.</EmptyText>
      ) : (
        <ul className="space-y-3">
          {entries.map((remark) => (
            <li key={remark.id} className="space-y-1 border-b border-border pb-3 last:border-b-0 last:pb-0" data-testid="history-remark">
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant={remark.kind === 'WARNING' ? 'warning' : 'accent'}>{REMARK_KIND_LABELS[remark.kind]}</Badge>
                  <span className="text-muted-foreground">{formatDate(remark.date)}</span>
                </span>
                {canEdit && (
                  <RowActions
                    label={`${REMARK_KIND_LABELS[remark.kind]} від ${formatDate(remark.date)}`}
                    onEdit={() => setDialog({ entry: remark })}
                    onDelete={() => remove.mutate(remark.id)}
                    disabled={remove.isPending}
                  />
                )}
              </div>
              <p className="min-w-0 [overflow-wrap:anywhere]">
                <span className="text-muted-foreground">За що: </span>
                {remark.text}
              </p>
              {remark.kind === 'WARNING' && remark.howToFix && (
                <p className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="text-muted-foreground">Як виправити: </span>
                  {remark.howToFix}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.isError && <p className="text-destructive">{mutationErrorText(remove.error, 'Не вдалося видалити запис.')}</p>}
      {dialog && <RemarkDialog junakId={junakId} entry={dialog.entry} onClose={() => setDialog(null)} />}
    </HistoryCard>
  );
}

function RemarkDialog({ junakId, entry, onClose }: { junakId: string; entry: JunakRemark | null; onClose: () => void }) {
  const add = useAddRemark(junakId);
  const update = useUpdateRemark(junakId);
  const mutation = entry ? update : add;
  const [kind, setKind] = useState<JunakRemarkKind>(entry?.kind ?? 'AWARD');
  const [date, setDate] = useState(entry?.date ?? today());
  const [text, setText] = useState(entry?.text ?? '');
  const [howToFix, setHowToFix] = useState(entry?.howToFix ?? '');
  const isWarning = kind === 'WARNING';
  const isValid = !!date && date >= '1990-01-01' && date <= today() && text.trim() !== '' && (!isWarning || howToFix.trim() !== '');

  function submit() {
    const fix = isWarning ? howToFix.trim() : undefined;
    if (entry) update.mutate({ id: entry.id, text: text.trim(), howToFix: fix, date }, { onSuccess: onClose });
    else add.mutate({ kind, text: text.trim(), howToFix: fix, date }, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{entry ? `Змінити: ${REMARK_KIND_LABELS[entry.kind].toLowerCase()}` : 'Відзначення або пересторога'}</DialogTitle>
        {!entry && (
          <div className="space-y-2">
            <Label htmlFor="remark-kind">Тип</Label>
            <select
              id="remark-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as JunakRemarkKind)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="AWARD">Відзначення</option>
              <option value="WARNING">Пересторога</option>
            </select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="remark-date">Дата</Label>
          <Input id="remark-date" type="date" min="1990-01-01" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="remark-text">За що</Label>
          <textarea id="remark-text" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} className={TEXTAREA} />
        </div>
        {isWarning && (
          <div className="space-y-2">
            <Label htmlFor="remark-how-to-fix">Як виправити</Label>
            <textarea
              id="remark-how-to-fix"
              rows={3}
              maxLength={1000}
              value={howToFix}
              onChange={(e) => setHowToFix(e.target.value)}
              className={TEXTAREA}
            />
          </div>
        )}
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти запис.')}</p>
        )}
        <DialogActions onCancel={onClose} onSubmit={submit} disabled={!isValid || mutation.isPending} />
      </DialogContent>
    </Dialog>
  );
}
