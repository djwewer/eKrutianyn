'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/session-client';
import { useKurin } from '@/lib/queries/kurin';
import { useOwnProfile } from '@/lib/queries/settings';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import { getInitials, cn } from '@/lib/utils';
import type { PositionType } from '@/lib/types';

const LINKS_BY_ROLE: Record<string, { href: string; label: string }[]> = {
  JUNAK: [
    { href: '/news', label: 'Оголошення' },
    { href: '/ai-vykhovnyk', label: 'AI-виховник' },
    { href: '/proby', label: 'Моя проба' },
    { href: '/my-activity', label: 'Моя активність' },
    { href: '/calendar', label: 'Календар' },
    { href: '/kurin', label: 'Курінь' },
    { href: '/settings', label: 'Налаштування' },
  ],
  VYKHOVNYK: [
    { href: '/news', label: 'Оголошення' },
    { href: '/calendar', label: 'Календар' },
    { href: '/kurin', label: 'Курінь' },
    { href: '/settings', label: 'Налаштування' },
  ],
  ZVYAZKOVYI: [
    { href: '/news', label: 'Оголошення' },
    { href: '/ai-vykhovnyk', label: 'AI-виховник' },
    { href: '/approval-requests', label: 'Запити' },
    { href: '/calendar', label: 'Календар' },
    { href: '/kurin', label: 'Курінь' },
    { href: '/audit-log', label: 'Журнал дій' },
    { href: '/settings', label: 'Налаштування' },
  ],
};

// Діловодство pages and the kurin position that opens each one (the zvyazkovyi
// and the kurinniy see all of them).
const DILOVODY_PAGES: { href: string; label: string; position: PositionType }[] = [
  { href: '/inventory', label: 'Облік реманенту', position: 'INTENDANT' },
  { href: '/suddivstvo', label: 'Суддівство', position: 'SUDDIA' },
  { href: '/pysarstvo', label: 'Писарство', position: 'PYSAR' },
  { href: '/treasury', label: 'Скарбниця', position: 'SKARBNYK' },
];

function NavLink({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  // AI-виховник gets a continuously shimmering gradient instead of the
  // standard blue active/hover fill, to stand out as a highlighted feature
  // regardless of whether its page is currently open. Once its page IS
  // open, the fill gives way to a solid theme-colored interior (dark in
  // dark mode, white in light mode) ringed by the same animated gradient,
  // so the button still reads as "you are here" rather than looking
  // identical in both states.
  const gradient = href === '/ai-vykhovnyk';

  return (
    <Link
      href={href}
      onClick={onClick}
      data-nav-gradient={gradient || undefined}
      className={cn(
        'rounded-md px-3 py-2 text-sm font-medium transition-[filter,color,background-color]',
        gradient &&
          !active &&
          'animate-[kmGradientShift_8s_ease-in-out_infinite] bg-[length:300%_300%] bg-[linear-gradient(120deg,#7C3AED,#2F5FD9,#06B6D4,#7C3AED)] text-white hover:brightness-110',
        gradient && active && 'ai-gradient-ring bg-background font-semibold text-accent-text',
        !gradient && cn('hover:bg-accent-soft hover:text-accent-text', active && 'bg-accent-soft font-semibold text-accent-text'),
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dilovodyOpen, setDilovodyOpen] = useState(false);
  const { data: session } = useSession();
  const { data: kurin } = useKurin({ enabled: !!session });
  const { data: profile } = useOwnProfile({ enabled: !!session });

  // A password someone else assigned on this account's behalf (a fresh
  // zvyazkovyi, a junak added directly with a temp password) must be
  // replaced before anything else is usable — read live from the profile,
  // not baked into the JWT, so it clears the moment the user changes it.
  useEffect(() => {
    if (profile?.mustChangePassword && pathname !== '/settings') {
      router.replace('/settings');
    }
  }, [profile?.mustChangePassword, pathname, router]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    queryClient.clear();
    router.push('/login');
    router.refresh();
  }

  if (!session) return null;

  const links = [...(LINKS_BY_ROLE[session.role] ?? [])];
  const dilovodyPages = DILOVODY_PAGES.filter(
    (page) => session.role === 'ZVYAZKOVYI' || session.isKurinniy || session.positions.includes(page.position),
  );
  // Several діловодство pages collapse into one «Діловодство» group; a single
  // one stays a plain link.
  const groupDilovody = dilovodyPages.length > 1;
  if (dilovodyPages.length === 1) {
    links.push({ href: dilovodyPages[0].href, label: dilovodyPages[0].label });
  }

  const dilovodyActive = dilovodyPages.some((p) => pathname?.startsWith(p.href));
  const dilovodyExpanded = dilovodyOpen || dilovodyActive;

  return (
    <nav className="flex flex-wrap items-center justify-between gap-6 border-b px-4 py-5 sm:px-8">
      <div className="flex min-w-0 items-center gap-3.5">
        <Image src="/logo.webp" alt="" width={36} height={36} className="size-9 shrink-0 rounded-md" />

        <Link href="/news" className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold tracking-wide text-accent">єПластун</span>
          {kurin && (
            <h1 className="truncate text-[19px] font-bold tracking-tight">
              {kurin.kurinNumber ? `Курінь ч.${kurin.kurinNumber}` : 'Підготовчий курінь'}{' '}
              {kurin.name.replace(/^курінь\s+/i, '')}
            </h1>
          )}
        </Link>
      </div>
      <div className="hidden items-center gap-1 sm:flex sm:flex-wrap">
        {links.map((link) => (
          <NavLink key={link.href} href={link.href} label={link.label} active={pathname === link.href} />
        ))}
        {groupDilovody && (
          <details className="relative">
            <summary
              className={cn(
                'cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent-soft hover:text-accent-text',
                dilovodyActive && 'bg-accent-soft font-semibold text-accent-text'
              )}
            >
              Діловодство
            </summary>
            <div className="absolute left-0 z-10 mt-1 flex flex-col rounded-md border bg-popover p-1 shadow-lg sm:left-auto sm:right-0">
              {dilovodyPages.map((page) => (
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
      <button
        type="button"
        aria-label="Меню"
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen((open) => !open)}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent-soft hover:text-accent-text sm:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M3 5h14M3 10h14M3 15h14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
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
      {mobileMenuOpen && (
        <div className="flex w-full flex-col gap-1 border-t pt-3 sm:hidden">
          {links.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              label={link.label}
              active={pathname === link.href}
              onClick={() => setMobileMenuOpen(false)}
            />
          ))}
          {groupDilovody && (
            <div>
              <button
                type="button"
                aria-expanded={dilovodyExpanded}
                onClick={() => setDilovodyOpen((open) => !open)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-accent-soft hover:text-accent-text',
                  dilovodyActive && 'bg-accent-soft font-semibold text-accent-text',
                )}
              >
                Діловодство
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                  className={cn('transition-transform', dilovodyExpanded && 'rotate-180')}
                >
                  <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {dilovodyExpanded && (
                <div className="ml-3 mt-1 flex flex-col gap-1 border-l pl-2">
                  {dilovodyPages.map((page) => (
                    <NavLink
                      key={page.href}
                      href={page.href}
                      label={page.label}
                      active={pathname === page.href}
                      onClick={() => setMobileMenuOpen(false)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
