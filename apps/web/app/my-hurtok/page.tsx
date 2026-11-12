'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useHurtky } from '@/lib/queries/hurtky';
import { useVykhovnykAssignments } from '@/lib/queries/vykhovnyk-assignments';
import { PageHeader } from '@/components/ui/page-header';
import { HurtokDetailPanel } from '@/components/hurtok-detail-panel';

export default function MyHurtokPage() {
  const { data: session } = useSession();
  const isVykhovnyk = session?.role === 'VYKHOVNYK';
  const { data: hurtky } = useHurtky();
  const { data: assignments } = useVykhovnykAssignments(undefined, { enabled: isVykhovnyk });
  const [selected, setSelected] = useState<string | null>(null);

  if (!session) return null;
  if (!isVykhovnyk) return <p className="text-sm text-destructive">Немає доступу.</p>;
  if (!hurtky || !assignments) return <p>Завантаження...</p>;

  const mine = hurtky.filter((h) => !!h.slug && assignments.some((a) => a.hurtokId === h.id));
  if (mine.length === 0) {
    return <p className="text-sm text-muted-foreground">Вас ще не прикріплено до жодного гуртка.</p>;
  }
  const current = mine.find((h) => h.slug === selected) ?? mine[0];

  return (
    <div>
      <PageHeader title="Мій гурток" />
      {mine.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Гурток">
          {mine.map((h) => (
            <button
              key={h.id}
              type="button"
              aria-pressed={h.id === current.id}
              onClick={() => setSelected(h.slug)}
              className={`min-h-[2.1rem] rounded-[4px] border-2 px-[.8rem] py-1 font-display text-[.76rem] font-semibold tracking-[.07em] uppercase ${h.id === current.id ? 'border-navy bg-primary text-primary-foreground' : 'border-line bg-paper hover:border-navy'}`}
            >
              {h.name}
            </button>
          ))}
        </div>
      )}
      <HurtokDetailPanel slug={current.slug!} heading="section" />
    </div>
  );
}
