'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Забули пароль?</CardTitle>
        </CardHeader>
        <CardContent>
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
          <div className="mt-4 text-center">
            <Link href="/login" className="text-sm underline">
              Повернутись до входу
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
