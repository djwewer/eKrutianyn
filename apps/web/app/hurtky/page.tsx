'use client';

import Link from 'next/link';
import { useHurtky } from '@/lib/queries/hurtky';
import { useVykhovnykAssignments } from '@/lib/queries/vykhovnyk-assignments';
import { useSession } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';
import type { Hurtok } from '@/lib/types';

export default function HurtkyPage() {
  const { data: session } = useSession();
  const isVykhovnyk = session?.role === 'VYKHOVNYK';
  const {
    data: hurtky,
    isLoading: hurtkyLoading,
    isError: hurtkyIsError,
    error: hurtkyError,
  } = useHurtky();
  const {
    data: assignments,
    isLoading: assignmentsLoading,
    isError: assignmentsIsError,
    error: assignmentsError,
  } = useVykhovnykAssignments(undefined, { enabled: isVykhovnyk });

  const isLoading = isVykhovnyk ? hurtkyLoading || assignmentsLoading : hurtkyLoading;
  const isError = isVykhovnyk ? hurtkyIsError || assignmentsIsError : hurtkyIsError;

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) {
    return (
      <p className="text-sm text-destructive">
        {accessErrorMessage(isVykhovnyk ? (hurtkyError ?? assignmentsError) : hurtkyError)}
      </p>
    );
  }

  const hurtokById = new Map((hurtky ?? []).map((h) => [h.id, h]));
  const displayedHurtky: Hurtok[] = isVykhovnyk
    ? (assignments ?? [])
        .map((a) => hurtokById.get(a.hurtokId))
        .filter((h): h is Hurtok => !!h)
    : (hurtky ?? []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Гуртки</h1>
      {session?.role === 'ZVYAZKOVYI' && (
        <Link href="/hurtky/new">
          <Button size="sm">Новий гурток</Button>
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {displayedHurtky.map((h) => (
          <Link
            key={h.id}
            href={`/${session?.kurinNumber ? encodeURIComponent(session.kurinNumber) : 'kurin'}/hurtky/${h.slug}`}
          >
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
