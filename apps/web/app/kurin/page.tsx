'use client';

import { Suspense } from 'react';
import { useSession } from '@/lib/session-client';
import { AccordionRoot, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { KurinInfoSection } from '@/components/kurin-info-section';
import { KurinProvidSection } from '@/components/kurin-provid-section';
import { KurinHurtkySection } from '@/components/kurin-hurtky-section';
import { KurinRosterSection } from '@/components/kurin-roster-section';

export default function KurinPage() {
  return (
    <Suspense fallback={<p>Завантаження...</p>}>
      <KurinPageContent />
    </Suspense>
  );
}

function KurinPageContent() {
  const { data: session } = useSession();

  const hasFullAccess =
    session?.role === 'ZVYAZKOVYI' || session?.isKurinniy || (session?.positions ?? []).includes('SUDDIA');

  const sections: { key: string; title: string; render: () => React.ReactNode }[] = [
    { key: 'info', title: 'Інформація по куреню', render: () => <KurinInfoSection /> },
    { key: 'provid', title: 'Провід куреня', render: () => <KurinProvidSection /> },
    { key: 'hurtky', title: 'Гуртки', render: () => <KurinHurtkySection /> },
    ...(hasFullAccess
      ? [
          { key: 'vykhovnyky', title: 'Кадра виховників', render: () => <KurinRosterSection role="VYKHOVNYK" /> },
          { key: 'junatstvo', title: 'Список юнацтва', render: () => <KurinRosterSection role="JUNAK" /> },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Курінь</h1>
      <AccordionRoot multiple>
        {sections.map((section) => (
          <AccordionItem key={section.key} value={section.key}>
            <AccordionTrigger>{section.title}</AccordionTrigger>
            <AccordionContent>{section.render()}</AccordionContent>
          </AccordionItem>
        ))}
      </AccordionRoot>
    </div>
  );
}
