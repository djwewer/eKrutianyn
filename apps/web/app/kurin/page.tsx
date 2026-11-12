'use client';

import { Suspense } from 'react';
import { useSession } from '@/lib/session-client';
import { PageHeader } from '@/components/ui/page-header';
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

  const sections: { key: string; title: string; sub: string; icon: React.ReactNode; render: () => React.ReactNode }[] = [
    {
      key: 'info',
      sub: 'Номер, станиця, програма проби, Google Drive',
      title: 'Інформація про курінь',
      icon: (
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <circle cx="8" cy="8" r="6" strokeWidth="1.3" />
          <path d="M8 7.2v4M8 5.1v.1" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
      render: () => <KurinInfoSection />,
    },
    {
      key: 'provid',
      sub: 'Посади куреня',
      title: 'Провід куреня',
      icon: (
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path d="M8 1.5l5 2v4c0 3.5-2.2 5.8-5 7-2.8-1.2-5-3.5-5-7v-4z" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      ),
      render: () => <KurinProvidSection />,
    },
    {
      key: 'hurtky',
      sub: 'Виховники та юнаки по гуртках',
      title: 'Гуртки',
      icon: (
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path d="M8 2l6 3-6 3-6-3 6-3z" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M2 8l6 3 6-3" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M2 11l6 3 6-3" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      ),
      render: () => <KurinHurtkySection />,
    },
    ...(hasFullAccess
      ? [
          {
            key: 'vykhovnyky',
            sub: 'Виховники та звʼязковий',
            title: 'Кадра виховників',
            icon: (
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <circle cx="8" cy="6" r="3.4" strokeWidth="1.3" />
                <path d="M6 8.8L5 14l3-1.6L11 14l-1-5.2" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            ),
            render: () => <KurinRosterSection role="VYKHOVNYK" />,
          },
          {
            key: 'junatstvo',
            sub: 'Усі юнаки куреня',
            title: 'Список юнацтва',
            icon: (
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <circle cx="2.5" cy="4" r="0.9" fill="currentColor" />
                <circle cx="2.5" cy="8" r="0.9" fill="currentColor" />
                <circle cx="2.5" cy="12" r="0.9" fill="currentColor" />
                <path d="M5.5 4h8M5.5 8h8M5.5 12h8" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            ),
            render: () => <KurinRosterSection role="JUNAK" />,
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader title="Курінь" />
      <AccordionRoot multiple>
        {sections.map((section) => (
          <AccordionItem key={section.key} value={section.key}>
            <AccordionTrigger>
              <span className="grid size-[2.3rem] shrink-0 place-items-center rounded-[4px] border border-line bg-background text-navy [&_svg]:size-[1.2rem]">
                {section.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">{section.title}</span>
                <span className="block font-sans text-[.85rem] font-normal tracking-normal text-ink-2 normal-case">{section.sub}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>{section.render()}</AccordionContent>
          </AccordionItem>
        ))}
      </AccordionRoot>
    </div>
  );
}
