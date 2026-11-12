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
    <div>
      <dt className="font-mono text-[.7rem] tracking-[.06em] text-ink-2 uppercase">{label}</dt>
      <dd className="m-0 mt-[.1rem] font-bold [overflow-wrap:anywhere]">{value}</dd>
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
    <div className="space-y-4">
      <h1 className="sr-only">Моя сторінка</h1>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar
          initials={getInitials(profile.firstName, profile.lastName)}
          photoUrl={profile.photoUpdatedAt ? `/api/backend/users/${profile.id}/photo?v=${profile.photoUpdatedAt}` : null}
          className="size-20 border-[3px] border-dashed border-navy bg-transparent font-display text-[1.6rem] font-bold text-navy"
        />
        <div className="min-w-0 flex-1">
          <p className="m-0 font-display text-[1.8rem] leading-[1.05] font-bold uppercase [overflow-wrap:anywhere]">
            {profile.lastName} {profile.firstName}
          </p>
          <p className="mt-[.3rem] mb-0 truncate text-ink-2">{profile.email}</p>
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
              <ul className="m-0 list-none p-0 text-sm">
                {myHurtky.map((h) => (
                  <li key={h.id} className="border-b border-dashed border-line py-[.45rem] font-bold last:border-b-0">
                    {h.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Вас ще не прикріплено до жодного гуртка.</p>
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
              <ul className="m-0 list-none p-0 text-sm">
                {positions.map((label) => (
                  <li key={label} className="border-b border-dashed border-line py-[.45rem] last:border-b-0">
                    <Badge variant="ok">{label}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Посад зараз немає</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Дані</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-[1.2rem] gap-y-[.8rem]">
            {hurtokName && <Row label="Гурток" value={hurtokName} />}
            {profile.birthDate && (
              <Row label="Дата народження" value={new Date(profile.birthDate).toLocaleDateString('uk-UA', { timeZone: 'UTC' })} />
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
