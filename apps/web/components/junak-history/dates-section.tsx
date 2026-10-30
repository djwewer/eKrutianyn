'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateHistoryDates } from '@/lib/queries/junak-history';
import { mutationErrorText } from '@/lib/error-message';
import { DialogActions, HistoryCard, formatDate, today } from './shared';

export function DatesSection({
  junakId,
  upyJoinedAt,
  plastOathAt,
  canEdit,
}: {
  junakId: string;
  upyJoinedAt: string | null;
  plastOathAt: string | null;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <HistoryCard
      title="Вступ і присяга"
      testId="history-dates"
      extra={
        canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Змінити дати
          </Button>
        ) : undefined
      }
    >
      <dl className="space-y-1">
        <div className="grid grid-cols-2 gap-3">
          <dt className="text-muted-foreground">Вступ до УПЮ</dt>
          <dd>{upyJoinedAt ? formatDate(upyJoinedAt) : '—'}</dd>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <dt className="text-muted-foreground">Пластова присяга</dt>
          <dd>{plastOathAt ? formatDate(plastOathAt) : '—'}</dd>
        </div>
      </dl>
      {open && (
        <DatesDialog junakId={junakId} upyJoinedAt={upyJoinedAt} plastOathAt={plastOathAt} onClose={() => setOpen(false)} />
      )}
    </HistoryCard>
  );
}

function DatesDialog({
  junakId,
  upyJoinedAt,
  plastOathAt,
  onClose,
}: {
  junakId: string;
  upyJoinedAt: string | null;
  plastOathAt: string | null;
  onClose: () => void;
}) {
  const update = useUpdateHistoryDates(junakId);
  const [joined, setJoined] = useState(upyJoinedAt ?? '');
  const [oath, setOath] = useState(plastOathAt ?? '');
  const valid = (!joined || joined <= today()) && (!oath || oath <= today());
  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>Дати вступу й присяги</DialogTitle>
        <p className="text-xs text-muted-foreground">Порожнє поле прибирає дату.</p>
        <div className="space-y-2">
          <Label htmlFor="history-upy-joined">Дата вступу до УПЮ</Label>
          <Input id="history-upy-joined" type="date" max={today()} value={joined} onChange={(e) => setJoined(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="history-plast-oath">Дата пластової присяги</Label>
          <Input id="history-plast-oath" type="date" max={today()} value={oath} onChange={(e) => setOath(e.target.value)} />
        </div>
        {update.isError && <p className="text-sm text-destructive">{mutationErrorText(update.error, 'Не вдалося зберегти дати.')}</p>}
        <DialogActions
          onCancel={onClose}
          onSubmit={() => update.mutate({ upyJoinedAt: joined || null, plastOathAt: oath || null }, { onSuccess: onClose })}
          disabled={!valid || update.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
