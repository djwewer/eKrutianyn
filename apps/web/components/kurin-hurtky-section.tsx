'use client';

import Link from 'next/link';
import { useHurtky } from '@/lib/queries/hurtky';
import { useVykhovnykAssignments } from '@/lib/queries/vykhovnyk-assignments';
import { useUsers } from '@/lib/queries/users';
import { useSession } from '@/lib/session-client';
import { AccordionRoot, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
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

  return (
    <div className="space-y-4">
      {session?.role === 'ZVYAZKOVYI' && (
        <Link href="/hurtky/new" className="inline-block">
          <Button size="sm">Новий гурток</Button>
        </Link>
      )}
      <AccordionRoot multiple>
        {displayedHurtky.map((h) => (
          <AccordionItem key={h.id} value={h.slug ?? h.id} disabled={!h.slug}>
            <AccordionTrigger>
              <span className="min-w-0 flex-1 truncate">
                {h.name}
                {h.number ? ` №${h.number}` : ''}
                {vykhovnykNameByHurtokId[h.id] && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    · {vykhovnykNameByHurtokId[h.id]}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            {h.slug && (
              <AccordionContent>
                <HurtokDetailPanel slug={h.slug} />
              </AccordionContent>
            )}
          </AccordionItem>
        ))}
      </AccordionRoot>
    </div>
  );
}
