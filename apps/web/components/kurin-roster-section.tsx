'use client';

import Link from 'next/link';
import { useSession } from '@/lib/session-client';
import { useUsers } from '@/lib/queries/users';
import { ROLE_LABELS } from '@/lib/role-labels';
import { RowList, Row } from '@/components/ui/row-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/utils';
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
      <RowList>
        {(users ?? []).map((u) => (
          <Link key={u.id} href={`/users/${u.id}`}>
            <Row initials={getInitials(u.firstName, u.lastName)} title={`${u.lastName} ${u.firstName}`}>
              <Badge variant="neutral">{ROLE_LABELS[u.role]}</Badge>
            </Row>
          </Link>
        ))}
      </RowList>
    </div>
  );
}
