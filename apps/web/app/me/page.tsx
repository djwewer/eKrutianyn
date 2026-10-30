'use client';

import { useSession } from '@/lib/session-client';
import { useOwnProfile } from '@/lib/queries/settings';
import { useHurtky } from '@/lib/queries/hurtky';
import { useVykhovnykAssignments } from '@/lib/queries/vykhovnyk-assignments';
import { JunakDegreesCard } from '@/components/junak-degrees-card';
import { JunakHistory } from '@/components/junak-history';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { POSITION_LABELS, ROLE_LABELS } from '@/lib/role-labels';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// Історія юнака (components/junak-history.tsx) — лише перегляд; редагують звʼязковий
// і виховник на сторінці юнака /users/[id].
export default function MePage() {
  const { data: session } = useSession();
  const { data: profile } = useOwnProfile({ enabled: !!session });
  const { data: hurtky } = useHurtky();
  const isVykhovnyk = session?.role === 'VYKHOVNYK';
  const { data: assignments } = useVykhovnykAssignments(undefined, { enabled: isVykhovnyk });

  if (!session || !profile) return <p>Завантаження...</p>;

  const hurtokName = hurtky?.find((h) => h.id === profile.hurtokId)?.name;
  const myHurtky = hurtky?.filter((h) => assignments?.some((a) => a.hurtokId === h.id)) ?? [];
  const positions = session.positions.map((p) => POSITION_LABELS[p]);
  if (session.role === 'ZVYAZKOVYI') positions.unshift(ROLE_LABELS.ZVYAZKOVYI);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="sr-only">Моя сторінка</h1>
      <div className="flex items-center gap-4">
        <Avatar
          initials={getInitials(profile.firstName, profile.lastName)}
          photoUrl={profile.photoUpdatedAt ? `/api/backend/users/${profile.id}/photo?v=${profile.photoUpdatedAt}` : null}
          className="size-16 text-base"
        />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">
            {profile.lastName} {profile.firstName}
          </p>
          <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
          <Badge className="mt-1">{ROLE_LABELS[profile.role]}</Badge>
        </div>
      </div>

      {session.role === 'JUNAK' && <JunakDegreesCard junakId={session.userId} canEdit={false} />}

      {session.role === 'JUNAK' && <JunakHistory junakId={session.userId} readOnly />}

      {isVykhovnyk && (
        <Card>
          <CardHeader>
            <CardTitle>Мої гуртки</CardTitle>
          </CardHeader>
          <CardContent>
            {myHurtky.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {myHurtky.map((h) => (
                  <li key={h.id}>{h.name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Вас ще не прикріплено до жодного гуртка.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Для юнака діловодство (поточне, зняте й до застосунку) показує секція «Історія». */}
      {session.role !== 'JUNAK' && (
        <Card>
          <CardHeader>
            <CardTitle>Діловодство</CardTitle>
          </CardHeader>
          <CardContent>
            {positions.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {positions.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Посад зараз немає</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Дані</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2">
            {hurtokName && <Row label="Гурток" value={hurtokName} />}
            {profile.birthDate && (
              <Row label="Дата народження" value={new Date(profile.birthDate).toLocaleDateString('uk-UA')} />
            )}
            {profile.phone && <Row label="Телефон" value={profile.phone} />}
            {profile.residence && <Row label="Проживання" value={profile.residence} />}
            {profile.studyPlace && <Row label="Навчання" value={profile.studyPlace} />}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
