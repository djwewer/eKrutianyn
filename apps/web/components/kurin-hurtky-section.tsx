'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useHurtky } from '@/lib/queries/hurtky';
import { useVykhovnykAssignments } from '@/lib/queries/vykhovnyk-assignments';
import { useUsers } from '@/lib/queries/users';
import { useSession } from '@/lib/session-client';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/error-message';
import { HurtokDetailPanel } from '@/components/hurtok-detail-panel';
import type { Hurtok } from '@/lib/types';

export function KurinHurtkySection() {
  const { data: session } = useSession();
  const {
    data: hurtky,
    isLoading: hurtkyLoading,
    isError: hurtkyIsError,
    error: hurtkyError,
  } = useHurtky();
  const { data: allVykhovnykAssignments } = useVykhovnykAssignments();
  const { data: vykhovnykUsers } = useUsers({ role: 'VYKHOVNYK' });
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(new Set());

  if (hurtkyLoading) return <p>Завантаження...</p>;
  if (hurtkyIsError) {
    return <p className="text-sm text-destructive">{accessErrorMessage(hurtkyError)}</p>;
  }

  const displayedHurtky: Hurtok[] = hurtky ?? [];

  const vykhovnykNameByHurtokId = Object.fromEntries(
    (allVykhovnykAssignments ?? []).map((a) => {
      const v = (vykhovnykUsers ?? []).find((u) => u.id === a.vykhovnykId);
      return [a.hurtokId, v ? `${v.lastName} ${v.firstName}` : null];
    }),
  );

  function toggle(slug: string) {
    setExpandedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {session?.role === 'ZVYAZKOVYI' && (
        <Link href="/hurtky/new">
          <Button size="sm">Новий гурток</Button>
        </Link>
      )}
      <div className="space-y-2">
        {displayedHurtky.map((h) => {
          const isExpanded = !!h.slug && expandedSlugs.has(h.slug);
          return (
            <Card key={h.id}>
              <CardHeader
                className="cursor-pointer"
                onClick={() => h.slug && toggle(h.slug)}
              >
                <CardTitle>
                  {h.name}
                  {h.number ? ` №${h.number}` : ''}
                  {vykhovnykNameByHurtokId[h.id] && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      · {vykhovnykNameByHurtokId[h.id]}
                    </span>
                  )}
                </CardTitle>
                <CardAction className="text-muted-foreground">{isExpanded ? '▾' : '▸'}</CardAction>
              </CardHeader>
              {isExpanded && h.slug && (
                <CardContent>
                  <HurtokDetailPanel slug={h.slug} />
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
