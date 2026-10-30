'use client';

import Link from 'next/link';
import { Award, Flag, Sparkles, CirclePlus, FileText } from 'lucide-react';
import { useSession } from '@/lib/session-client';

const TILE_BASE = 'flex min-h-[150px] flex-col justify-between rounded-2xl p-4 text-left';
const TILES: { href: string; title: string; text: string; icon: typeof Flag; ai?: boolean }[] = [
  { href: '/proby', title: 'Моя проба', text: 'Точки проби та їх стан', icon: Flag },
  { href: '/ai-vykhovnyk', title: 'AI-виховник', text: 'Запитай про будь-яку точку', icon: Sparkles, ai: true },
  { href: '/my-activity', title: 'Додати акцію', text: 'Табір, сходини, акція', icon: CirclePlus },
  { href: '/skills', title: 'Вмілості', text: 'Каталог вмілостей і вимоги', icon: Award },
];

export default function PlastuvanniaPage() {
  const { data: session } = useSession();
  if (!session) return null;
  if (session.role !== 'JUNAK' && session.role !== 'ZVYAZKOVYI') {
    return <p className="text-sm text-destructive">Немає доступу.</p>;
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Моє пластування</h1>
        {session.role === 'ZVYAZKOVYI' && (
          <span className="mt-2 inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-text">
            Тестовий режим: хаб юнака
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TILES.map(({ href, title, text, icon: Icon, ai }) => (
          <Link
            key={href}
            href={href}
            className={
              ai
                ? `${TILE_BASE} bg-[linear-gradient(125deg,#7C3AED,#2F5FD9_55%,#0891B2)] text-white hover:brightness-110`
                : `${TILE_BASE} border border-border bg-background transition-colors hover:bg-accent-soft`
            }
          >
            <span className={ai ? 'grid size-10 place-items-center rounded-xl bg-white/20' : 'grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-text'}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <strong className="block text-base leading-tight">{title}</strong>
              <span className={ai ? 'text-sm text-white/90' : 'text-sm text-muted-foreground'}>{text}</span>
            </span>
          </Link>
        ))}
        <div aria-disabled="true" className={`${TILE_BASE} border border-dashed border-border opacity-60`}>
          <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
            <FileText className="size-5" aria-hidden />
          </span>
          <span>
            <strong className="block text-base leading-tight">Запит</strong>
            <span className="text-sm text-muted-foreground">Дозвіл, посвідка, документ</span>
            <span className="mt-1 block text-xs font-semibold text-accent-text">Скоро</span>
          </span>
        </div>
      </div>
    </div>
  );
}
