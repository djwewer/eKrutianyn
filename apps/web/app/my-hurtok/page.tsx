'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session-client';
import { useHurtky } from '@/lib/queries/hurtky';
import { useVykhovnykAssignments } from '@/lib/queries/vykhovnyk-assignments';
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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Мій гурток</h1>
      {mine.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Гурток">
          {mine.map((h) => (
            <button
              key={h.id}
              type="button"
              aria-pressed={h.id === current.id}
              onClick={() => setSelected(h.slug)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${h.id === current.id ? 'border-transparent bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent-soft'}`}
            >
              {h.name}
            </button>
          ))}
        </div>
      )}
      <HurtokDetailPanel slug={current.slug!} />
    </div>
  );
}
