'use client';

import { useState } from 'react';
import { useKurin, useChangeProbyProgram, useChangeKurinNumber } from '@/lib/queries/kurin';
import { useSession } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accessErrorMessage } from '@/lib/error-message';
import { ApiError } from '@/lib/api-client';

export default function KurinPage() {
  const { data: kurin, isLoading } = useKurin();
  const { data: session } = useSession();
  const [newProgramId, setNewProgramId] = useState('');
  const changeProgram = useChangeProbyProgram(kurin?.id ?? '');
  const changeKurinNumber = useChangeKurinNumber(kurin?.id ?? '');
  const [newKurinNumber, setNewKurinNumber] = useState('');
  const canChangeProgram = session?.role === 'ZVYAZKOVYI';

  if (isLoading) return <p>Завантаження...</p>;
  if (!kurin) return <p>Не знайдено.</p>;

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{kurin.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Дані куреня</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>Номер: {kurin.kurinNumber}</p>
          <p>Станиця: {kurin.stanytsia}</p>
          <p>Стать: {kurin.gender === 'MALE' ? 'Чоловіча' : 'Жіноча'}</p>
          {canChangeProgram && (
            <div className="space-y-2">
              <Label htmlFor="newKurinNumber">Змінити номер куреня</Label>
              <Input
                id="newKurinNumber"
                value={newKurinNumber}
                onChange={(e) => setNewKurinNumber(e.target.value)}
                placeholder={kurin.kurinNumber}
              />
              <Button
                size="sm"
                disabled={!newKurinNumber || changeKurinNumber.isPending}
                onClick={() =>
                  changeKurinNumber.mutate(newKurinNumber, { onSuccess: () => setNewKurinNumber('') })
                }
              >
                Змінити номер
              </Button>
              {changeKurinNumber.isError && (
                <p className="text-sm text-destructive">
                  {changeKurinNumber.error instanceof ApiError && changeKurinNumber.error.status === 409
                    ? 'Цей номер уже зайнятий.'
                    : accessErrorMessage(changeKurinNumber.error)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Програма проб</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Поточна програма: {kurin.probyProgramId}</p>
          {canChangeProgram && (
            <>
              <div className="space-y-2">
                <Label htmlFor="newProgramId">ID нової програми</Label>
                <Input
                  id="newProgramId"
                  value={newProgramId}
                  onChange={(e) => setNewProgramId(e.target.value)}
                />
              </div>
              <Button
                disabled={!newProgramId || changeProgram.isPending}
                onClick={() => changeProgram.mutate(newProgramId)}
              >
                Змінити програму
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
