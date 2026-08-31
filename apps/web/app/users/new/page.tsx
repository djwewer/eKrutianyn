'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateApprovalRequest } from '@/lib/queries/approval-requests';
import { useHurtky } from '@/lib/queries/hurtky';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewJunakRequestPage() {
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
    await createRequest.mutateAsync({
      actionType: 'CREATE_JUNAK',
      newData: { firstName, lastName, email, hurtokId },
    });
    setSubmitted(true);
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
