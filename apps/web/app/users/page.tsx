'use client';

import Link from 'next/link';
import { useSession } from '@/lib/session-client';
import { useUsers } from '@/lib/queries/users';
import { Card, CardContent } from '@/components/ui/card';

export default function UsersPage() {
  const { data: session } = useSession();
  const { data: users, isLoading } = useUsers();

  if (isLoading) return <p>Завантаження...</p>;

  const title = session?.role === 'ZVYAZKOVYI' ? 'Люди куреня' : 'Юнаки куреня';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="space-y-2">
        {(users ?? []).map((u) => (
          <Link key={u.id} href={`/users/${u.id}`}>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <span>
                  {u.lastName} {u.firstName}
                </span>
                <span className="text-sm text-muted-foreground">{u.role}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
