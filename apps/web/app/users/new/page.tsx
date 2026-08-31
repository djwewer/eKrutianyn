'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useCreateApprovalRequest } from '@/lib/queries/approval-requests';
import { useHurtky } from '@/lib/queries/hurtky';
import { useSession } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Role, UserSummary } from '@/lib/types';

function ZvyazkovyiDirectCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: hurtky } = useHurtky();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('JUNAK');
  const [hurtokId, setHurtokId] = useState('');
  const [password, setPassword] = useState('');

  const createUser = useMutation({
    mutationFn: () =>
      apiFetch<UserSummary>('/users', {
        method: 'POST',
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          role,
          password: password || undefined,
          hurtokId: hurtokId || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      router.push('/users');
    },
  });

  const needsHurtok = role === 'JUNAK' || role === 'KURINNYI';

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Новий користувач</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createUser.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="role">Роль</Label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="JUNAK">Юнак</option>
              <option value="VYKHOVNYK">Виховник</option>
              <option value="KURINNYI">Курінний</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="firstName">Ім&apos;я</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Прізвище</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Пароль (опційно, можна додати пізніше)</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {needsHurtok && (
            <div className="space-y-2">
              <Label htmlFor="hurtokId">Гурток</Label>
              <select
                id="hurtokId"
                value={hurtokId}
                onChange={(e) => setHurtokId(e.target.value)}
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Оберіть гурток</option>
                {(hurtky ?? []).map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {createUser.isError && <p className="text-sm text-destructive">Не вдалося створити користувача.</p>}
          <Button type="submit" disabled={createUser.isPending}>
            Створити
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function KurinnyiApprovalRequestForm() {
  const router = useRouter();
  const { data: hurtky } = useHurtky();
  const createRequest = useCreateApprovalRequest();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [hurtokId, setHurtokId] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createRequest.mutateAsync({
        actionType: 'CREATE_JUNAK',
        newData: { firstName, lastName, email, hurtokId },
      });
      setSubmitted(true);
    } catch {
      /* handled by MutationCache.onError for 401; other errors just stop-and-not-navigate */
    }
  }

  if (submitted) {
    return (
      <Card className="max-w-md">
        <CardContent className="p-6">
          <p>Запит створено. Юнак з&apos;явиться після затвердження зв&apos;язковим.</p>
          <Button className="mt-4" onClick={() => router.push('/users')}>
            До списку
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Запит на створення юнака</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Ім&apos;я</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Прізвище</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hurtokId">Гурток</Label>
            <select
              id="hurtokId"
              value={hurtokId}
              onChange={(e) => setHurtokId(e.target.value)}
              required
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Оберіть гурток</option>
              {(hurtky ?? []).map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={createRequest.isPending}>
            Надіслати запит
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function NewUserPage() {
  const { data: session } = useSession();

  if (session?.role === 'ZVYAZKOVYI') {
    return <ZvyazkovyiDirectCreateForm />;
  }
  return <KurinnyiApprovalRequestForm />;
}
