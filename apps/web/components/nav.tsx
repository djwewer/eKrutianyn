'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

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

export function Nav() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

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

  return (
    <nav className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-4">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm font-medium">
            {link.label}
          </Link>
        ))}
        {session.role === 'ZVYAZKOVYI' && (
          <details className="relative">
            <summary className="cursor-pointer text-sm font-medium">Діловодство</summary>
            <div className="absolute z-10 mt-1 flex flex-col rounded border bg-background p-2 shadow-md">
              {DILOVODY_PAGES.map((page) => (
                <Link key={page.href} href={page.href} className="whitespace-nowrap px-2 py-1 text-sm">
                  {page.label}
                </Link>
              ))}
            </div>
          </details>
        )}
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Вийти
        </Button>
      </div>
    </nav>
  );
}
