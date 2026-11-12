'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/auth-layout';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true);
  }

  return (
    <AuthLayout title="Забули пароль?" subtitle="ВІДНОВЛЕННЯ ДОСТУПУ">
      {sent ? (
        <p className="text-sm text-muted-foreground">
          Якщо такий email зареєстровано, на нього надіслано лист із посиланням для відновлення пароля.
        </p>
      ) : (
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Зачекайте...' : 'Надіслати посилання'}
          </Button>
        </form>
      )}
      <div className="text-center">
        <Link href="/login" className="text-sm underline">
          Повернутись до входу
        </Link>
      </div>
    </AuthLayout>
  );
}
