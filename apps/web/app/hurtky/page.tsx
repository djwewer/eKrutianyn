'use client';

import Link from 'next/link';
import { useHurtky } from '@/lib/queries/hurtky';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function HurtkyPage() {
  const { data: hurtky, isLoading } = useHurtky();

  if (isLoading) return <p>Завантаження...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Гуртки</h1>
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
