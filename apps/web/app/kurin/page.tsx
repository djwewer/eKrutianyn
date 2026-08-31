'use client';

import { useState } from 'react';
import { useKurin, useChangeProbyProgram } from '@/lib/queries/kurin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function KurinPage() {
  const { data: kurin, isLoading } = useKurin();
  const [newProgramId, setNewProgramId] = useState('');
  const changeProgram = useChangeProbyProgram(kurin?.id ?? '');

  if (isLoading) return <p>Завантаження...</p>;
  if (!kurin) return <p>Не знайдено.</p>;

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{kurin.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Дані куреня</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Номер: {kurin.kurinNumber}</p>
          <p>Станиця: {kurin.stanytsia}</p>
          <p>Стать: {kurin.gender === 'MALE' ? 'Чоловіча' : 'Жіноча'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Програма проб</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Поточна програма: {kurin.probyProgramId}</p>
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
        </CardContent>
      </Card>
    </div>
  );
}
