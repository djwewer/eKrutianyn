'use client';

import Link from 'next/link';
import { useHurtky } from '@/lib/queries/hurtky';
import { useSession } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function HurtkyPage() {
  const { data: session } = useSession();
  const { data: hurtky, isLoading } = useHurtky();

  if (isLoading) return <p>Завантаження...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Гуртки</h1>
      {session?.role === 'ZVYAZKOVYI' && (
        <Link href="/hurtky/new">
          <Button size="sm">Новий гурток</Button>
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(hurtky ?? []).map((h) => (
          <Link key={h.id} href={`/hurtky/${h.id}`}>
            <Card>
              <CardHeader>
                <CardTitle>
                  {h.name}
                  {h.number ? ` №${h.number}` : ''}
                </CardTitle>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
