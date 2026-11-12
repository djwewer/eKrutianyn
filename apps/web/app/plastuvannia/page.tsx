'use client';

import Link from 'next/link';
import { Award, Flag, Sparkles, CirclePlus, FileText } from 'lucide-react';
import { useSession } from '@/lib/session-client';
import { useProbyProgram, useJunakProgress } from '@/lib/queries/proby';
import { useJunakDegrees } from '@/lib/queries/junak-degrees';
import { overallPercent } from '@/lib/proby-progress';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeading } from '@/components/ui/section-heading';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { cn } from '@/lib/utils';
import type { DegreeKey } from '@/lib/types';

const TILE_BASE =
  'relative grid min-h-[8.5rem] content-start gap-[.35rem] rounded-[6px] border border-line bg-paper p-4 text-ink no-underline';
const TILE_TITLE = 'font-display text-[1.15rem] font-semibold tracking-[.04em] uppercase';
const TILE_TEXT = 'text-[.88rem] text-ink-2';
const TILE_ICON = 'size-[1.8rem] text-navy';

const TILES: { href: string; title: string; text: string; icon: typeof Flag; ai?: boolean; bar?: boolean }[] = [
  { href: '/proby', title: 'Моя проба', text: 'Точки проби та їх стан', icon: Flag, bar: true },
  { href: '/ai-vykhovnyk', title: 'AI-виховник', text: 'Запитай про будь-яку точку', icon: Sparkles, ai: true },
  { href: '/my-activity', title: 'Додати акцію', text: 'Табір, сходини, акція', icon: CirclePlus },
  { href: '/skills', title: 'Вмілості', text: 'Каталог вмілостей і вимоги', icon: Award },
];

const DEGREES: { key: DegreeKey; label: string }[] = [
  { key: 'PRYHYLNYK', label: 'Прихильник' },
  { key: 'UCHASNYK', label: 'Учасник' },
  { key: 'ROZVIDUVACH', label: 'Розвідувач' },
  { key: 'SKOB', label: 'Скоб' },
];

const SHORT_MONTHS = ['січ.', 'лют.', 'бер.', 'квіт.', 'трав.', 'черв.', 'лип.', 'серп.', 'вер.', 'жовт.', 'лист.', 'груд.'];

// Degree dates are date-only values stored as UTC midnight: read the UTC parts.
function degreeMonthYear(iso: string) {
  const d = new Date(iso);
  return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export default function PlastuvanniaPage() {
  const { data: session } = useSession();
  const { data: program } = useProbyProgram();
  const { data: progress } = useJunakProgress(session?.userId);
  const { data: degrees } = useJunakDegrees(session?.userId);
  if (!session) return null;
  if (session.role !== 'JUNAK' && session.role !== 'ZVYAZKOVYI') {
    return <p className="text-sm text-destructive">Немає доступу.</p>;
  }
  const percent = program && progress ? overallPercent(program, progress) : 0;
  // The degree being worked on is the first one without a date.
  const currentKey = degrees ? DEGREES.find(({ key }) => !degrees.dates[key])?.key : undefined;
  return (
    <div>
      <PageHeader
        title="Моє пластування"
        subtitle="Проба, вмілості, акції і помічник для підготовки"
        actions={session.role === 'ZVYAZKOVYI' && <Badge>Тестовий режим: хаб юнака</Badge>}
      />
      {degrees && (
        <div className="grid grid-cols-2 gap-2 min-[760px]:grid-cols-4">
          {DEGREES.map(({ key, label }) => {
            const date = degrees.dates[key];
            const cur = key === currentKey;
            return (
              <div
                key={key}
                data-testid={`hub-degree-${key}`}
                className={cn(
                  'grid gap-[.2rem] rounded-[6px] border-2 px-[.6rem] py-[.7rem] text-center',
                  date ? 'border-sky bg-sky-soft' : cur ? 'border-dashed border-signal bg-paper' : 'border-line bg-paper',
                )}
              >
                <b className="font-display text-[.95rem] font-semibold tracking-[.05em] uppercase">{label}</b>
                <span className="font-mono text-[.72rem] text-ink-2">
                  {date ? degreeMonthYear(date) : cur ? `${percent}%` : 'попереду'}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <SectionHeading className="mt-6">Розділи</SectionHeading>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-[.8rem]">
        {TILES.map(({ href, title, text, icon: Icon, ai, bar }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              TILE_BASE,
              'transition-colors',
              ai ? 'ai-gradient-ring' : 'hover:border-navy',
            )}
            style={ai ? ({ '--ai-ring-fill': 'var(--paper)' } as React.CSSProperties) : undefined}
          >
            <Icon className={cn(TILE_ICON, ai && 'text-[#7c3aed]')} aria-hidden />
            <b className={cn(TILE_TITLE, ai && 'ai-gradient-text')}>{title}</b>
            <span className={TILE_TEXT}>{text}</span>
            {bar && <ProgressBar value={percent} className="mt-[.4rem]" aria-hidden="true" />}
          </Link>
        ))}
        <div aria-disabled="true" className={cn(TILE_BASE, 'pointer-events-none opacity-55')}>
          <FileText className={TILE_ICON} aria-hidden />
          <b className={TILE_TITLE}>Запит</b>
          <span className={TILE_TEXT}>Дозвіл, посвідка, документ</span>
          <Badge variant="mute" className="absolute top-[.8rem] right-[.8rem]">
            Скоро
          </Badge>
        </div>
      </div>
    </div>
  );
}
