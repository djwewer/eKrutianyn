'use client';

import { use, useState, useEffect } from 'react';
import { useUser, useUpdateContactInfo } from '@/lib/queries/users';
import { useSession } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: user, isLoading } = useUser(id);
  const { data: session } = useSession();
  const updateContactInfo = useUpdateContactInfo(id);
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (user) {
      setNotes(user.notes ?? '');
      setPhone(user.phone ?? '');
    }
  }, [user]);

  if (isLoading) return <p>Завантаження...</p>;
  if (!user) return <p>Не знайдено.</p>;

  const canEditContactInfo =
    session?.role === 'ZVYAZKOVYI' || (session?.role === 'KURINNYI' && user.role === 'JUNAK');

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">
        {user.lastName} {user.firstName}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Дані</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Email: {user.email}</p>
          <p>Роль: {user.role}</p>
          {user.birthDate && <p>Дата народження: {user.birthDate}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Контакти</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Телефон</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!canEditContactInfo}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Нотатки</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEditContactInfo}
            />
          </div>
          {canEditContactInfo && (
            <Button onClick={() => updateContactInfo.mutate({ notes, phone })}>
              Зберегти
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
