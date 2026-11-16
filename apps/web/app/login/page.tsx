'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/auth-layout';
import { KURIN_DEACTIVATED_MESSAGE, isKurinDeactivated } from '@/lib/api-client';
import { GoogleSignInButton } from '@/components/google-signin-button';

function LoginContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    useSearchParams().get('reason') === 'kurin-deactivated' ? KURIN_DEACTIVATED_MESSAGE : null,
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = res.status === 403 ? await res.json().catch(() => null) : null;
      setError(isKurinDeactivated(body) ? KURIN_DEACTIVATED_MESSAGE : 'Невірний email або пароль');
      return;
    }
    queryClient.clear();
    router.push('/');
    router.refresh();
  }

  return (
    <AuthLayout title="єПластун" subtitle="КУРІННИЙ ЖУРНАЛ ОНЛАЙН">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Зачекайте...' : 'Увійти'}
        </Button>
      </form>
      {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
        <>
          <div className="flex items-center gap-[.7rem] font-mono text-[.72rem] uppercase text-ink-2 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
            або
          </div>
          <GoogleSignInButton />
        </>
      )}
      <div className="text-center">
        <Link href="/forgot-password" className="text-sm underline">
          Забули пароль?
        </Link>
      </div>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
