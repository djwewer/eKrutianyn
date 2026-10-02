'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/session-client';
import { useKurin } from '@/lib/queries/kurin';
import { useOwnProfile } from '@/lib/queries/settings';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import { getInitials, cn } from '@/lib/utils';

const LINKS_BY_ROLE: Record<string, { href: string; label: string }[]> = {
  JUNAK: [
    { href: '/proby', label: 'Моя проба' },
    { href: '/kurin', label: 'Курінь' },
    { href: '/settings', label: 'Налаштування' },
  ],
  VYKHOVNYK: [
    { href: '/kurin', label: 'Курінь' },
    { href: '/settings', label: 'Налаштування' },
  ],
  ZVYAZKOVYI: [
    { href: '/approval-requests', label: 'Запити' },
    { href: '/kurin', label: 'Курінь' },
    { href: '/settings', label: 'Налаштування' },
  ],
};

const DILOVODY_PAGES = [
  { href: '/inventory', label: 'Облік реманенту' },
  { href: '/suddivstvo', label: 'Суддівство' },
];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent-soft hover:text-accent-text',
        active && 'bg-accent-soft font-semibold text-accent-text'
      )}
    >
      {label}
    </Link>
  );
}

export function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: kurin } = useKurin({ enabled: !!session });
  const { data: profile } = useOwnProfile({ enabled: !!session });

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    queryClient.clear();
    router.push('/login');
    router.refresh();
  }

  if (!session) return null;

  const links = [...(LINKS_BY_ROLE[session.role] ?? [])];
  if (session.role !== 'ZVYAZKOVYI' && (session.positions.includes('INTENDANT') || session.isKurinniy)) {
    links.push({ href: '/inventory', label: 'Облік реманенту' });
  }
  if (session.role !== 'ZVYAZKOVYI' && (session.positions.includes('SUDDIA') || session.isKurinniy)) {
    links.push({ href: '/suddivstvo', label: 'Суддівство' });
  }

  const dilovodyActive = DILOVODY_PAGES.some((p) => pathname?.startsWith(p.href));

  return (
    <nav className="flex flex-wrap items-center justify-between gap-6 border-b px-8 py-5">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-base font-bold text-accent-foreground">
          К
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold tracking-wide text-accent uppercase">Пласт</span>
          {kurin && (
            <h1 className="truncate text-[19px] font-bold tracking-tight">
              Курінь ч. {kurin.kurinNumber} «{kurin.name}»
            </h1>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {links.map((link) => (
          <NavLink key={link.href} href={link.href} label={link.label} active={pathname === link.href} />
        ))}
        {session.role === 'ZVYAZKOVYI' && (
          <details className="relative">
            <summary
              className={cn(
                'cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent-soft hover:text-accent-text',
                dilovodyActive && 'bg-accent-soft font-semibold text-accent-text'
              )}
            >
              Діловодство
            </summary>
            <div className="absolute z-10 mt-1 flex flex-col rounded-md border bg-popover p-1 shadow-lg">
              {DILOVODY_PAGES.map((page) => (
                <Link
                  key={page.href}
                  href={page.href}
                  className="whitespace-nowrap rounded-sm px-2.5 py-1.5 text-sm hover:bg-accent-soft"
                >
                  {page.label}
                </Link>
              ))}
            </div>
          </details>
        )}
      </div>
      <div className="flex items-center gap-3.5">
        <ThemeToggle />
        {profile && (
          <Avatar
            initials={getInitials(profile.firstName, profile.lastName)}
            photoUrl={profile.photoUpdatedAt ? `/api/backend/users/${profile.id}/photo?v=${profile.photoUpdatedAt}` : null}
          />
        )}
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Вийти
        </Button>
      </div>
    </nav>
  );
}
