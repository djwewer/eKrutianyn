'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
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
  return (
    <Link
      href={href}
      onClick={onClick}
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    <nav className="flex flex-wrap items-center justify-between gap-6 border-b px-4 py-5 sm:px-8">
      <div className="flex min-w-0 items-center gap-3.5">
        <Image src="/logo.webp" alt="" width={36} height={36} className="size-9 shrink-0 rounded-md" />

        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold tracking-wide text-accent">єПластун</span>
          {kurin && (
            <h1 className="truncate text-[19px] font-bold tracking-tight">
              Курінь ч.{kurin.kurinNumber} {kurin.name.replace(/^курінь\s+/i, '')}
            </h1>
          )}
        </div>
      </div>
      <div className="hidden items-center gap-1 sm:flex sm:flex-wrap">
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
            <div className="absolute left-0 z-10 mt-1 flex flex-col rounded-md border bg-popover p-1 shadow-lg sm:left-auto sm:right-0">
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
          {session.role === 'ZVYAZKOVYI' &&
            DILOVODY_PAGES.map((page) => (
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
    </nav>
  );
}
