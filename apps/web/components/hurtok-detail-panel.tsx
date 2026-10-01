'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useHurtokBySlug } from '@/lib/queries/hurtky';
import { useSession } from '@/lib/session-client';
import { ROLE_LABELS, POSITION_LABELS } from '@/lib/role-labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';
import { HurtokSettingsDialog } from '@/components/hurtok-settings-dialog';

export function HurtokDetailPanel({ slug }: { slug: string }) {
  const { data, isLoading, isError, error } = useHurtokBySlug(slug);
  const { data: session } = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Гурток не знайдено.'}</p>;
  if (!data) return <p>Гурток не знайдено.</p>;

  const canAddJunak = (session?.role === 'ZVYAZKOVYI' || session?.isKurinniy) && !data.hurtok.archivedAt;
  const canConfigure =
    (session?.role === 'ZVYAZKOVYI' || (session?.positions ?? []).includes('SUDDIA')) && !data.hurtok.archivedAt;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {data.hurtok.name}
        {data.hurtok.number ? ` №${data.hurtok.number}` : ''}
      </h1>
      {data.hurtok.foundedAt && (
        <p className="text-sm text-muted-foreground">
          Засновано {new Date(data.hurtok.foundedAt).toLocaleDateString('uk-UA', { timeZone: 'UTC' })}
        </p>
      )}
      {data.hurtok.archivedAt && (
        <p className="text-sm text-muted-foreground">
          Архівовано {new Date(data.hurtok.archivedAt).toLocaleDateString('uk-UA')}
        </p>
      )}
      <div className="flex gap-2">
        {canAddJunak && (
          <Link href={`/users/new?hurtokId=${data.hurtok.id}`}>
            <Button size="sm" variant="outline">
              Додати юнака/чку
            </Button>
          </Link>
        )}
        {canConfigure && (
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            Налаштування
          </Button>
        )}
      </div>
      {canConfigure && (
        <HurtokSettingsDialog
          hurtok={data.hurtok}
          members={data.members}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}
      <div className="space-y-2">
        {data.members.map((member) => (
          <Link key={member.id} href={`/users/${member.id}`}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {member.lastName} {member.firstName}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {ROLE_LABELS[member.role]}
                {member.positions.length > 0 &&
                  ` · ${member.positions.map((p) => POSITION_LABELS[p.positionType]).join(', ')}`}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
