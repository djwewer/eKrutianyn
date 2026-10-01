'use client';

import { Suspense, useState } from 'react';
import { useSession } from '@/lib/session-client';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KurinInfoSection } from '@/components/kurin-info-section';
import { KurinProvidSection } from '@/components/kurin-provid-section';

type SectionKey = 'info' | 'provid' | 'hurtky' | 'vykhovnyky' | 'junatstvo';

export default function KurinPage() {
  return (
    <Suspense fallback={<p>Завантаження...</p>}>
      <KurinPageContent />
    </Suspense>
  );
}

function KurinPageContent() {
  const { data: session } = useSession();
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set());

  function toggle(key: SectionKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const hasFullAccess =
    session?.role === 'ZVYAZKOVYI' || session?.isKurinniy || (session?.positions ?? []).includes('SUDDIA');

  const sections: { key: SectionKey; title: string; render: () => React.ReactNode }[] = [
    { key: 'info', title: 'Інформація по куреню', render: () => <KurinInfoSection /> },
    { key: 'provid', title: 'Провід куреня', render: () => <KurinProvidSection /> },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Курінь</h1>
      <div className="space-y-2">
        {sections.map((section) => {
          const isExpanded = expanded.has(section.key);
          return (
            <Card key={section.key}>
              <CardHeader className="cursor-pointer" onClick={() => toggle(section.key)}>
                <CardTitle>{section.title}</CardTitle>
                <CardAction className="text-muted-foreground">{isExpanded ? '▾' : '▸'}</CardAction>
              </CardHeader>
              {isExpanded && <CardContent>{section.render()}</CardContent>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
