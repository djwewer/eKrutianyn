'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddPastPosition, useRemovePastPosition, useUpdatePastPosition } from '@/lib/queries/junak-history';
import { accessErrorMessage, mutationErrorText } from '@/lib/error-message';
import { POSITION_SCOPE_LABELS, formatYears } from '@/lib/history-labels';
import { useAssignPosition, useKurinPositions } from '@/lib/queries/positions';
import { useSession } from '@/lib/session-client';
import { HURTOK_SCOPE_POSITIONS, KURIN_SCOPE_POSITIONS, POSITION_LABELS } from '@/lib/role-labels';
import type { JunakPastPosition, JunakPositionHistory, PositionScope, PositionType } from '@/lib/types';
import { Segmented } from '@/components/ui/segmented';
import { DialogActions, EmptyText, HistoryCard, RowActions } from './shared';
import { nativeSelectClass } from '@/components/ui/native-select';

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
  hurtokId,
  positions,
  pastPositions,
  canEdit,
}: {
  junakId: string;
  /** The junak's own hurtok — needed to assign a hurtok-scoped position. */
  hurtokId: string | null;
  positions: JunakPositionHistory[];
  pastPositions: JunakPastPosition[];
  canEdit: boolean;
}) {
  const [dialog, setDialog] = useState<{
    entry: JunakPastPosition | null;
  } | null>(null);
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
                {row.current && <Badge variant="ok">зараз</Badge>}
                {row.past && <Badge variant="mute">до застосунку</Badge>}
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
      {dialog && <PositionDialog junakId={junakId} hurtokId={hurtokId} entry={dialog.entry} onClose={() => setDialog(null)} />}
    </HistoryCard>
  );
}

type Mode = 'assign' | 'archive';

const SCOPE_OPTIONS: Record<PositionScope, PositionType[]> = {
  KURIN: KURIN_SCOPE_POSITIONS,
  HURTOK: HURTOK_SCOPE_POSITIONS,
};

/**
 * Only the звʼязковий assigns from here (the API's звʼязковий rule: any scope and type). The курінний is a junak, so he never
 * reaches this dialog — he assigns through Провід куреня; the виховник гуртка gets archive mode only.
 */
function useAssignableTypes(hurtokId: string | null): Record<PositionScope, PositionType[]> {
  const { data: session } = useSession();
  if (session?.role !== 'ZVYAZKOVYI') return { KURIN: [], HURTOK: [] };
  return { KURIN: KURIN_SCOPE_POSITIONS, HURTOK: hurtokId ? HURTOK_SCOPE_POSITIONS : [] };
}

function PositionDialog({
  junakId,
  hurtokId,
  entry,
  onClose,
}: {
  junakId: string;
  hurtokId: string | null;
  entry: JunakPastPosition | null;
  onClose: () => void;
}) {
  const assignable = useAssignableTypes(hurtokId);
  const canAssign = !entry && (assignable.KURIN.length > 0 || assignable.HURTOK.length > 0);
  const [mode, setMode] = useState<Mode>(canAssign ? 'assign' : 'archive');
  const effectiveMode = canAssign ? mode : 'archive';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{entry ? 'Змінити запис архіву' : 'Додати посаду'}</DialogTitle>
        {canAssign && (
          <Segmented
            label="Тип запису"
            value={effectiveMode}
            onChange={setMode}
            options={[
              { value: 'assign', label: 'Призначити зараз' },
              { value: 'archive', label: 'Посада до застосунку' },
            ]}
          />
        )}
        {effectiveMode === 'assign' ? (
          <AssignFields junakId={junakId} hurtokId={hurtokId} assignable={assignable} onClose={onClose} />
        ) : (
          <PastPositionFields junakId={junakId} entry={entry} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AssignFields({
  junakId,
  hurtokId,
  assignable,
  onClose,
}: {
  junakId: string;
  hurtokId: string | null;
  assignable: Record<PositionScope, PositionType[]>;
  onClose: () => void;
}) {
  const assign = useAssignPosition();
  const { data: active } = useKurinPositions();
  const scopes = (['HURTOK', 'KURIN'] as const).filter((sc) => assignable[sc].length > 0);
  const [scope, setScope] = useState<PositionScope>(scopes[0]);
  const [positionType, setPositionType] = useState<PositionType | ''>('');
  const options = assignable[scope];
  const chosen = options.includes(positionType as PositionType) ? (positionType as PositionType) : '';

  const inScope = (active ?? []).filter((p) => p.scope === scope && (scope === 'KURIN' || p.hurtokId === hurtokId));
  const own = inScope.find((p) => p.user.id === junakId);
  const alreadyThere = !!chosen && own?.positionType === chosen;

  function submit() {
    if (!chosen || alreadyThere) return;
    const slotHolder = inScope.find((p) => p.positionType === chosen && p.user.id !== junakId);
    if (own || slotHolder) {
      const text = own
        ? `Юнак вже займає посаду «${POSITION_LABELS[own.positionType]}». Призначення на «${POSITION_LABELS[chosen]}» автоматично зніме поточну посаду. Продовжити?`
        : `Посаду «${POSITION_LABELS[chosen]}» зараз обіймає ${slotHolder!.user.lastName} ${slotHolder!.user.firstName}. Призначення автоматично зніме цю людину з посади. Продовжити?`;
      if (!window.confirm(text)) return;
    }
    assign.mutate(
      {
        userId: junakId,
        scope,
        positionType: chosen,
        ...(scope === 'HURTOK' && hurtokId ? { hurtokId } : {}),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="assign-position-scope">Де</Label>
        <select
          id="assign-position-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as PositionScope)}
          className={nativeSelectClass}
        >
          {scopes.includes('HURTOK') && <option value="HURTOK">У гуртку</option>}
          {scopes.includes('KURIN') && <option value="KURIN">У курені</option>}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="assign-position-type">Посада</Label>
        <select
          id="assign-position-type"
          value={chosen}
          onChange={(e) => setPositionType(e.target.value as PositionType)}
          className={nativeSelectClass}
        >
          <option value="" disabled>
            Оберіть посаду
          </option>
          {options.map((t) => (
            <option key={t} value={t}>
              {POSITION_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      {alreadyThere && <p className="text-sm text-ink-2">Юнак уже на цій посаді.</p>}
      {assign.isError && <p className="text-sm text-destructive">{accessErrorMessage(assign.error) ?? 'Помилка при призначенні.'}</p>}
      <DialogActions onCancel={onClose} onSubmit={submit} disabled={!chosen || alreadyThere || assign.isPending} />
    </>
  );
}

function PastPositionFields({ junakId, entry, onClose }: { junakId: string; entry: JunakPastPosition | null; onClose: () => void }) {
  const add = useAddPastPosition(junakId);
  const update = useUpdatePastPosition(junakId);
  const mutation = entry ? update : add;
  const currentYear = new Date().getUTCFullYear();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [scope, setScope] = useState<PositionScope>(entry?.scope ?? 'HURTOK');
  const [yearFrom, setYearFrom] = useState(entry ? String(entry.yearFrom) : '');
  const [yearTo, setYearTo] = useState(entry?.yearTo ? String(entry.yearTo) : '');

  // Position names for the chosen «Де»; a legacy free-text title stays selectable.
  const titleOptions = [...SCOPE_OPTIONS[scope].map((t) => POSITION_LABELS[t])];
  if (entry && !titleOptions.includes(entry.title)) titleOptions.push(entry.title);
  const validTitle = titleOptions.includes(title) ? title : '';

  const from = Number(yearFrom);
  const to = yearTo ? Number(yearTo) : null;
  const yearsValid =
    Number.isInteger(from) &&
    from >= 1990 &&
    from <= currentYear &&
    (to === null || (Number.isInteger(to) && to >= from && to <= currentYear));

  function submit() {
    const dto = { title: validTitle, scope, yearFrom: from, yearTo: to };
    if (entry) update.mutate({ id: entry.id, ...dto }, { onSuccess: onClose });
    else add.mutate(dto, { onSuccess: onClose });
  }

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="past-position-scope">Де</Label>
        <select
          id="past-position-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as PositionScope)}
          className={nativeSelectClass}
        >
          <option value="HURTOK">У гуртку</option>
          <option value="KURIN">У курені</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="past-position-title">Посада</Label>
        <select id="past-position-title" value={validTitle} onChange={(e) => setTitle(e.target.value)} className={nativeSelectClass}>
          <option value="" disabled>
            Оберіть посаду
          </option>
          {titleOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
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
      {mutation.isError && <p className="text-sm text-destructive">{mutationErrorText(mutation.error, 'Не вдалося зберегти запис.')}</p>}
      {!yearsValid && yearFrom && (
        <p className="text-sm text-destructive">Роки мають бути від 1990 до поточного, а рік завершення — не раніше року початку.</p>
      )}
      <DialogActions onCancel={onClose} onSubmit={submit} disabled={!validTitle || !yearsValid || mutation.isPending} />
    </>
  );
}
