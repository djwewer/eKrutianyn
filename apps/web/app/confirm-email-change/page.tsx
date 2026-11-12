'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthLayout } from '@/components/auth-layout';

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
    <AuthLayout title="Підтвердження email" subtitle="ЗМІНА АДРЕСИ">
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
    </AuthLayout>
  );
}
