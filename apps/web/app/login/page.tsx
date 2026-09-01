'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GoogleSignInButton } from '@/components/google-signin-button';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
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
      setError('Невірний email або пароль');
      return;
    }
    queryClient.clear();
    router.push('/');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Вхід</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="mt-2 text-center">
            <Link href="/forgot-password" className="text-sm underline">
              Забули пароль?
            </Link>
          </div>
          <div className="mt-4">
            <GoogleSignInButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
