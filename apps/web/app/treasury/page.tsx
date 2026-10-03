'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useTreasury, useUpdateStartingBalance, useCreateTransaction, useDeleteTransaction } from '@/lib/queries/treasury';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accessErrorMessage } from '@/lib/error-message';

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
        <p className="text-sm text-muted-foreground">
          Сума готівки й коштів на рахунку куреня на момент, коли ви почали вести облік тут — до неї додаються/віднімаються
          записані прибутки й витрати.
        </p>
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-40" />
            <Button
              size="sm"
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
            <p className="text-sm font-medium">{formatCents(startingBalanceCents)} грн</p>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Змінити
            </Button>
          </div>
        )}
        {update.isError && <p className="text-sm text-destructive">{accessErrorMessage(update.error) ?? 'Не вдалося зберегти.'}</p>}
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
          className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none dark:bg-input/30"
        >
          <option value="EXPENSE">Витрата</option>
          <option value="INCOME">Прибуток</option>
        </select>
        <Input type="number" step="0.01" min="0" placeholder="Сума (грн)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input placeholder="Опис (напр. «вкладка за теренівку»)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        <Button
          size="sm"
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
        {create.isError && <p className="text-sm text-destructive">{accessErrorMessage(create.error) ?? 'Не вдалося додати запис.'}</p>}
      </CardContent>
    </Card>
  );
}

function TransactionRow({ transaction, kurinId, canEdit }: { transaction: import('@/lib/types').TreasuryTransaction; kurinId: string; canEdit: boolean }) {
  const remove = useDeleteTransaction(kurinId);
  const isIncome = transaction.type === 'INCOME';

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{transaction.description}</p>
        <p className="text-xs text-muted-foreground">{new Date(transaction.occurredAt).toLocaleDateString('uk-UA')}</p>
      </div>
      <p className={`shrink-0 text-sm font-semibold ${isIncome ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
        {isIncome ? '+' : '-'}
        {formatCents(transaction.amountCents)} грн
      </p>
      {canEdit && (
        <Button size="sm" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate(transaction.id)}>
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
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження.'}</p>;
  if (!kurinId || !treasury) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Скарбниця</h1>
      <Card>
        <CardHeader>
          <CardTitle>Поточний баланс</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCents(treasury.currentBalanceCents)} грн</p>
        </CardContent>
      </Card>

      <StartingBalanceCard kurinId={kurinId} startingBalanceCents={treasury.startingBalanceCents} canEdit={canEdit} />
      {canEdit && <AddTransactionForm kurinId={kurinId} />}

      <Card>
        <CardHeader>
          <CardTitle>Історія операцій</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {treasury.transactions.length === 0 && <p className="text-sm text-muted-foreground">Ще немає жодного запису.</p>}
          {treasury.transactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} kurinId={kurinId} canEdit={canEdit} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
