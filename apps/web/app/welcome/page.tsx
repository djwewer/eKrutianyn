'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/auth-layout';

type InviteInfo = { firstName: string; kurinLabel: string };

function WelcomeContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = useSearchParams().get('token');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid'>(token ? 'loading' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/backend/auth/invite/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setStatus('invalid');
          return;
        }
        setInvite((await res.json()) as InviteInfo);
        setStatus('valid');
      })
      .catch(() => {
        if (!cancelled) setStatus('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Пароль має містити щонайменше 8 символів.');
      return;
    }
    if (password !== confirm) {
      setError('Паролі не збігаються.');
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/auth/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword: password }),
    });
    if (!res.ok) {
      setSubmitting(false);
      if (res.status === 400) {
        setError('Пароль має містити щонайменше 8 символів.');
      } else {
        setStatus('invalid');
      }
      return;
    }
    queryClient.clear();
    router.replace('/');
    router.refresh();
  }

  if (status === 'loading') {
    return (
      <AuthLayout title="Вітаємо" subtitle="ЗАПРОШЕННЯ">
        <p className="text-sm text-ink-2">Завантаження...</p>
      </AuthLayout>
    );
  }

  if (status === 'invalid' || !invite) {
    return (
      <AuthLayout title="Запрошення" subtitle="ПОСИЛАННЯ НЕДІЙСНЕ">
        <div className="space-y-3">
          <p className="text-sm text-destructive">Посилання недійсне або вже використане</p>
          <p className="text-sm text-ink-2">Попросіть звʼязкового надіслати запрошення ще раз.</p>
          <Link href="/forgot-password" className="text-sm text-primary underline">
            Забули пароль?
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={`Вітаємо, ${invite.firstName}!`} subtitle={`Курінь ${invite.kurinLabel}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="newPassword">Новий пароль</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Повторіть пароль</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Зачекайте...' : 'Встановити пароль і увійти'}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeContent />
    </Suspense>
  );
}
