'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useTreasury, useUpdateStartingBalance, useCreateTransaction, useDeleteTransaction } from '@/lib/queries/treasury';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { accessErrorMessage } from '@/lib/error-message';
import { formatEventDate } from '@/lib/calendar-timeline';
import { nativeSelectClass } from '@/components/ui/native-select';

const LABEL_CLASS = 'font-mono text-[.72rem] tracking-[.06em] text-ink-2 uppercase';

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseToCents(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function StartingBalanceCard({ kurinId, startingBalanceCents, canEdit }: { kurinId: string; startingBalanceCents: number; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => (startingBalanceCents / 100).toString());
  const update = useUpdateStartingBalance(kurinId);

  if (!canEdit) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Початковий баланс</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-ink-2">
          Сума готівки й коштів на рахунку куреня на момент, коли ви почали вести облік тут — до неї додаються/віднімаються
          записані прибутки й витрати.
        </p>
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-40" />
            <Button
              size="sm"
              variant="signal"
              disabled={update.isPending}
              onClick={() => {
                const cents = parseToCents(value);
                if (cents === null) return;
                update.mutate(cents, { onSuccess: () => setEditing(false) });
              }}
            >
              Зберегти
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Скасувати
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="font-mono text-base font-bold">{formatCents(startingBalanceCents)} грн</p>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Змінити
            </Button>
          </div>
        )}
        {update.isError && <p className="text-sm text-late">{accessErrorMessage(update.error) ?? 'Не вдалося зберегти.'}</p>}
      </CardContent>
    </Card>
  );
}

function AddTransactionForm({ kurinId }: { kurinId: string }) {
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const create = useCreateTransaction(kurinId);

  const amountCents = parseToCents(amount);
  const canSubmit = amountCents !== null && description.trim().length > 0 && !create.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Додати запис</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as 'INCOME' | 'EXPENSE')}
          className={nativeSelectClass}
          aria-label="Тип запису"
        >
          <option value="EXPENSE">Витрата</option>
          <option value="INCOME">Прибуток</option>
        </select>
        <Input type="number" step="0.01" min="0" placeholder="Сума (грн)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input placeholder="Опис (напр. «вкладка за теренівку»)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        <Button
          variant="signal"
          disabled={!canSubmit}
          onClick={() =>
            create.mutate(
              { type, amountCents: amountCents!, description: description.trim(), occurredAt },
              {
                onSuccess: () => {
                  setAmount('');
                  setDescription('');
                },
              },
            )
          }
        >
          Додати
        </Button>
        {create.isError && <p className="text-sm text-late">{accessErrorMessage(create.error) ?? 'Не вдалося додати запис.'}</p>}
      </CardContent>
    </Card>
  );
}

function TransactionRow({ transaction, kurinId, canEdit }: { transaction: import('@/lib/types').TreasuryTransaction; kurinId: string; canEdit: boolean }) {
  const remove = useDeleteTransaction(kurinId);
  const isIncome = transaction.type === 'INCOME';

  return (
    <div className="flex items-center gap-3 border-b border-dashed border-line px-[.9rem] py-[.65rem] last:border-b-0">
      <span className="min-w-[5.5rem] font-mono text-[.82rem] text-ink-2">{formatEventDate(transaction.occurredAt)}</span>
      <p className="m-0 min-w-0 flex-1 truncate text-base font-bold">{transaction.description}</p>
      <p className={`m-0 shrink-0 font-mono font-bold whitespace-nowrap ${isIncome ? 'text-ok' : 'text-late'}`}>
        {isIncome ? '+' : '-'}
        {formatCents(transaction.amountCents)} грн
      </p>
      {canEdit && (
        <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(transaction.id)}>
          Видалити
        </Button>
      )}
    </div>
  );
}

export default function TreasuryPage() {
  const { data: session } = useSession();
  const kurinId = session?.kurinId;
  const { data: treasury, isLoading, isError, error } = useTreasury(kurinId);
  const canEdit = session?.role === 'ZVYAZKOVYI' || !!session?.positions.includes('SKARBNYK');

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-late">{accessErrorMessage(error) ?? 'Помилка завантаження.'}</p>;
  if (!kurinId || !treasury) return null;

  return (
    <div className="space-y-4">
      <PageHeader title="Скарбниця" subtitle="Готівка і кошти на рахунку куреня" />
      <div className="grid gap-4 min-[760px]:grid-cols-2 min-[760px]:items-start">
        <Card>
          <CardHeader>
            <CardTitle className={LABEL_CLASS}>Поточний баланс</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 font-mono text-[2.6rem] leading-none font-bold tracking-[-.03em]">
              {formatCents(treasury.currentBalanceCents)} грн
            </p>
          </CardContent>
        </Card>
        <StartingBalanceCard kurinId={kurinId} startingBalanceCents={treasury.startingBalanceCents} canEdit={canEdit} />
      </div>
      {canEdit && <AddTransactionForm kurinId={kurinId} />}

      <Card>
        <CardHeader>
          <CardTitle>Історія операцій</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {treasury.transactions.length === 0 && <p className="px-[1.2rem] text-sm text-ink-2">Ще немає жодного запису.</p>}
          {treasury.transactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} kurinId={kurinId} canEdit={canEdit} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
