'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useHurtokBySlug } from '@/lib/queries/hurtky';
import { useVykhovnykAssignments } from '@/lib/queries/vykhovnyk-assignments';
import { useUser } from '@/lib/queries/users';
import { useSession } from '@/lib/session-client';
import { ROLE_LABELS, POSITION_LABELS } from '@/lib/role-labels';
import { RowList, Row } from '@/components/ui/row-list';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeading } from '@/components/ui/section-heading';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/utils';
import { formatEventDate } from '@/lib/dates';
import { accessErrorMessage } from '@/lib/error-message';
import { HurtokSettingsDialog } from '@/components/hurtok-settings-dialog';

// heading: 'page' renders the hurtok name as the page h1 (own route), 'section'
// as an h2 (under another page's h1), 'none' omits it (inside the kurin accordion,
// whose trigger already names the hurtok).
export function HurtokDetailPanel({ slug, heading = 'page' }: { slug: string; heading?: 'page' | 'section' | 'none' }) {
  const { data, isLoading, isError, error } = useHurtokBySlug(slug);
  const { data: session } = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: assignments } = useVykhovnykAssignments(data?.hurtok.id, { enabled: !!data?.hurtok.id });
  const { data: vykhovnyk } = useUser(assignments?.[0]?.vykhovnykId);

  if (isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Гурток не знайдено.'}</p>;
  if (!data) return <p>Гурток не знайдено.</p>;

  const canAddJunak = (session?.role === 'ZVYAZKOVYI' || session?.isKurinniy) && !data.hurtok.archivedAt;
  const canConfigure =
    (session?.role === 'ZVYAZKOVYI' || (session?.positions ?? []).includes('SUDDIA')) && !data.hurtok.archivedAt;

  // Hurtkovyi (and anyone else holding a position) rise to the top of the
  // roster instead of sitting wherever the backend happened to return them.
  const sortedMembers = [...data.members].sort((a, b) => {
    const rank = (m: typeof a) => {
      if (m.positions.some((p) => p.positionType === 'HURTKOVYI')) return 0;
      if (m.positions.length > 0) return 1;
      return 2;
    };
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.lastName.localeCompare(b.lastName, 'uk');
  });

  const title = `${data.hurtok.name}${data.hurtok.number ? ` №${data.hurtok.number}` : ''}`;
  const vykhovnykLine = vykhovnyk ? `Виховник: ${vykhovnyk.lastName} ${vykhovnyk.firstName}` : null;

  const actions =
    canAddJunak || canConfigure ? (
      <>
        {canAddJunak && (
          <Link href={`/users/new?hurtokId=${data.hurtok.id}`}>
            <Button size="sm">+ Додати юнака/чку</Button>
          </Link>
        )}
        {canConfigure && (
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            Налаштування
          </Button>
        )}
      </>
    ) : null;

  const meta = (
    <>
      {data.hurtok.foundedAt && (
        <p className="m-0 text-sm text-ink-2">
          Засновано {formatEventDate(data.hurtok.foundedAt)}
        </p>
      )}
      {data.hurtok.archivedAt && (
        <p className="m-0 text-sm text-ink-2">Архівовано {new Date(data.hurtok.archivedAt).toLocaleDateString('uk-UA')}</p>
      )}
    </>
  );

  return (
    <div className="space-y-[.9rem]">
      {heading === 'page' && <PageHeader title={title} subtitle={vykhovnykLine} actions={actions} />}
      {heading === 'section' && (
        <>
          <SectionHeading>{title}</SectionHeading>
          {vykhovnykLine && <p className="m-0 text-sm text-ink-2">{vykhovnykLine}</p>}
        </>
      )}
      {meta}
      {heading !== 'page' && actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {canConfigure && (
        <HurtokSettingsDialog
          hurtok={data.hurtok}
          members={data.members}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}
      <RowList>
        {sortedMembers.map((member) => (
          <Link key={member.id} href={`/users/${member.id}`} className="block border-b border-dashed border-line last:border-b-0">
            <Row
              className="border-b-0"
              initials={getInitials(member.firstName, member.lastName)}
              photoUrl={member.photoUpdatedAt ? `/api/backend/users/${member.id}/photo?v=${member.photoUpdatedAt}` : null}
              title={`${member.lastName} ${member.firstName}`}
              subtitle={`${ROLE_LABELS[member.role]}${
                member.positions.length > 0 ? ` · ${member.positions.map((p) => POSITION_LABELS[p.positionType]).join(', ')}` : ''
              }`}
            >
              <span aria-hidden="true" className="text-[1.2rem] text-ink-2">›</span>
            </Row>
          </Link>
        ))}
      </RowList>
    </div>
  );
}
