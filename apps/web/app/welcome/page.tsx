'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/auth-layout';

type InviteInfo = { firstName: string; kurinLabel: string };

function WelcomeContent() {
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
    let res: Response;
    try {
      res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
    } catch {
      setSubmitting(false);
      setError("Не вдалося з'єднатися. Спробуйте ще раз.");
      return;
    }
    if (!res.ok) {
      setSubmitting(false);
      // The API answers 404 for an unknown/used/expired token and 401 for an archived account.
      if (res.status === 404 || res.status === 401) {
        setStatus('invalid');
      } else if (res.status === 400) {
        setError('Пароль має містити щонайменше 8 символів.');
      } else {
        setError('Щось пішло не так. Спробуйте ще раз.');
      }
      return;
    }
    // Full navigation so the session is always fresh.
    window.location.assign('/');
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
