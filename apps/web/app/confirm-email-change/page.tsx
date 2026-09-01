'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = use(searchParams);
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    fetch('/api/auth/confirm-email-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then((res) => setStatus(res.ok ? 'success' : 'error'));
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Підтвердження email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'pending' && <p className="text-sm text-muted-foreground">Перевіряємо посилання...</p>}
          {status === 'success' && (
            <p className="text-sm text-muted-foreground">Email підтверджено. Увійдіть новою адресою.</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-destructive">Посилання недійсне або застаріле.</p>
          )}
          <Link href="/login" className="text-sm underline">
            Повернутись до входу
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
