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
  // Кадра виховників also lists the kurin's own zvyazkovyi — they lead the
  // kurin's vykhovnyky even though their Role is ZVYAZKOVYI, not VYKHOVNYK.
  const { data: zvyazkovyiUsers, isLoading: zvyazkovyiLoading } = useUsers(
    { role: 'ZVYAZKOVYI' },
    { enabled: role === 'VYKHOVNYK' },
  );

  if (isLoading || zvyazkovyiLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error)}</p>;

  const canCreate =
    role === 'VYKHOVNYK'
      ? session?.role === 'ZVYAZKOVYI'
      : session?.role === 'ZVYAZKOVYI' || session?.isKurinniy;

  const rosterUsers = role === 'VYKHOVNYK' ? [...(zvyazkovyiUsers ?? []), ...(users ?? [])] : (users ?? []);

  return (
    <div className="space-y-4">
      {canCreate && (
        <Link href={`/users/new?role=${role}`}>
          <Button size="sm">Додати людину</Button>
        </Link>
      )}
      <RowList>
        {rosterUsers.map((u) => (
          <Link key={u.id} href={`/users/${u.id}`}>
            <Row
              initials={getInitials(u.firstName, u.lastName)}
              photoUrl={u.photoUpdatedAt ? `/api/backend/users/${u.id}/photo?v=${u.photoUpdatedAt}` : null}
              title={`${u.lastName} ${u.firstName}`}
            >
              <Badge variant="neutral">{ROLE_LABELS[u.role]}</Badge>
            </Row>
          </Link>
        ))}
      </RowList>
    </div>
  );
}
