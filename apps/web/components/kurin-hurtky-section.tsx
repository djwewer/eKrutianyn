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

function hurtokHue(h: Hurtok) {
  const n = parseInt(h.number ?? '', 10);
  return ((Number.isNaN(n) ? (h.name.codePointAt(0) ?? 0) : n) * 47) % 360;
}

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
    <div className="space-y-[.9rem]">
      {session?.role === 'ZVYAZKOVYI' && (
        <Link href="/hurtky/new" className="inline-block">
          <Button size="sm">Новий гурток</Button>
        </Link>
      )}
      <AccordionRoot multiple className="gap-[.6rem]">
        {displayedHurtky.map((h) => (
          <AccordionItem key={h.id} value={h.slug ?? h.id} disabled={!h.slug}>
            <AccordionTrigger>
              <span
                aria-hidden="true"
                style={{ '--h': hurtokHue(h) } as React.CSSProperties}
                className="grid size-[2.3rem] shrink-0 place-items-center rounded-[4px] bg-[hsl(var(--h)_40%_88%)] font-display text-[1.5rem] leading-none font-bold tracking-normal text-[hsl(var(--h)_45%_25%)] dark:bg-[hsl(var(--h)_25%_20%)] dark:text-[hsl(var(--h)_55%_75%)]"
              >
                {h.number ?? h.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base">{h.name}</span>
                {vykhovnykNameByHurtokId[h.id] && (
                  <span className="block font-sans text-[.85rem] font-normal tracking-normal text-ink-2 normal-case">
                    виховник {vykhovnykNameByHurtokId[h.id]}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            {h.slug && (
              <AccordionContent>
                <HurtokDetailPanel slug={h.slug} heading="none" />
              </AccordionContent>
            )}
          </AccordionItem>
        ))}
      </AccordionRoot>
    </div>
  );
}
