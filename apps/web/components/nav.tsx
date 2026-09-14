'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/session-client';
import { Button } from '@/components/ui/button';

const LINKS_BY_ROLE: Record<string, { href: string; label: string }[]> = {
  JUNAK: [
    { href: '/proby', label: 'Моя проба' },
    { href: '/settings', label: 'Налаштування' },
  ],
  VYKHOVNYK: [
    { href: '/hurtky', label: 'Мої гуртки' },
    { href: '/settings', label: 'Налаштування' },
  ],
  ZVYAZKOVYI: [
    { href: '/approval-requests', label: 'Запити' },
    { href: '/users', label: 'Люди' },
    { href: '/hurtky', label: 'Гуртки' },
    { href: '/vykhovnyk-assignments', label: 'Призначення' },
    { href: '/kurin', label: 'Курінь' },
    { href: '/positions', label: 'Діловоди' },
    { href: '/settings', label: 'Налаштування' },
  ],
};

const DILOVODY_PAGES = [{ href: '/inventory', label: 'Облік реманенту' }];

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
  if (session.isKurinniy) {
    links.splice(1, 0, { href: '/users', label: 'Юнаки' }, { href: '/vykhovnyk-assignments', label: 'Виховники' });
  }
  if (session.role !== 'ZVYAZKOVYI' && (session.positions.includes('INTENDANT') || session.isKurinniy)) {
    links.push({ href: '/inventory', label: 'Облік реманенту' });
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
      <Button variant="outline" size="sm" onClick={handleLogout}>
        Вийти
      </Button>
    </nav>
  );
}
