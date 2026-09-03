'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useUsers } from '@/lib/queries/users';
import { ROLE_LABELS } from '@/lib/role-labels';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';
import type { Role } from '@/lib/types';

const ZVYAZKOVYI_FILTERS: { value: Role | undefined; label: string }[] = [
  { value: undefined, label: 'Усі' },
  { value: 'JUNAK', label: 'Юнаки' },
  { value: 'VYKHOVNYK', label: 'Виховники' },
];

const KURINNIY_FILTERS: { value: Role | undefined; label: string }[] = [
  { value: undefined, label: 'Юнаки' },
  { value: 'VYKHOVNYK', label: 'Виховники' },
  { value: 'ZVYAZKOVYI', label: "Зв'язковий" },
];

export default function UsersPage() {
  const { data: session } = useSession();
  const [roleFilter, setRoleFilter] = useState<Role | undefined>(undefined);
  const { data: users, isLoading, isError, error } = useUsers({ role: roleFilter });

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error)}</p>;

  const filters = session?.role === 'ZVYAZKOVYI' ? ZVYAZKOVYI_FILTERS : session?.isKurinniy ? KURINNIY_FILTERS : [];
  const canCreate = session?.role === 'ZVYAZKOVYI' || session?.isKurinniy;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Люди куреня</h1>
      {canCreate && (
        <Link href="/users/new">
          <Button size="sm">Додати людину</Button>
        </Link>
      )}
      {filters.length > 0 && (
        <div className="flex gap-2">
          {filters.map((f) => (
            <Button
              key={f.label}
              variant={roleFilter === f.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoleFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
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
