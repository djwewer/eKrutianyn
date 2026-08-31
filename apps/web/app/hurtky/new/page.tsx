'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Hurtok } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewHurtokPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');

  const createHurtok = useMutation({
    mutationFn: () =>
      apiFetch<Hurtok>('/hurtky', {
        method: 'POST',
        body: JSON.stringify({ name, number: number || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hurtky'] });
      router.push('/hurtky');
    },
  });

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Новий гурток</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createHurtok.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Назва</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="number">Номер (опційно)</Label>
            <Input id="number" value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <Button type="submit" disabled={createHurtok.isPending}>
            Створити
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
