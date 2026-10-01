'use client';

import Link from 'next/link';
import { useSession } from '@/lib/session-client';
import { useUsers } from '@/lib/queries/users';
import { ROLE_LABELS } from '@/lib/role-labels';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';
import type { Role } from '@/lib/types';

export function KurinRosterSection({ role }: { role: Extract<Role, 'VYKHOVNYK' | 'JUNAK'> }) {
  const { data: session } = useSession();
  const { data: users, isLoading, isError, error } = useUsers({ role });

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error)}</p>;

  const canCreate =
    role === 'VYKHOVNYK'
      ? session?.role === 'ZVYAZKOVYI'
      : session?.role === 'ZVYAZKOVYI' || session?.isKurinniy;

  return (
    <div className="space-y-4">
      {canCreate && (
        <Link href={`/users/new?role=${role}`}>
          <Button size="sm">Додати людину</Button>
        </Link>
      )}
      <div className="space-y-2">
        {(users ?? []).map((u) => (
          <Link key={u.id} href={`/users/${u.id}`}>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <span>
                  {u.lastName} {u.firstName}
                </span>
                <span className="text-sm text-muted-foreground">{ROLE_LABELS[u.role]}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
