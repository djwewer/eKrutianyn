'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import { useOwnProfile } from '@/lib/queries/settings';
import { useKurin } from '@/lib/queries/kurin';
import { useApprovalRequests } from '@/lib/queries/approval-requests-list';
import { buildNav } from '@/lib/nav-model';
import { MobileHeader } from '@/components/mobile-header';
import { BottomNav } from '@/components/bottom-nav';
import { SidebarNav } from '@/components/sidebar-nav';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const { data: kurin } = useKurin({ enabled: !!session });
  const { data: profile } = useOwnProfile({ enabled: !!session });
  const isZvyazkovyi = session?.role === 'ZVYAZKOVYI';
  const { data: pending } = useApprovalRequests('PENDING', { enabled: isZvyazkovyi });

  // Пароль, призначений за користувача (новий звʼязковий, юнак з тимчасовим паролем),
  // треба замінити до будь-чого іншого — читаємо наживо з профілю, а не з JWT.
  useEffect(() => {
    if (profile?.mustChangePassword && pathname !== '/settings') {
      router.replace('/settings');
    }
  }, [profile?.mustChangePassword, pathname, router]);

  if (!session) return <main className="p-4">{children}</main>;

  const nav = buildNav(session, pending?.length ?? 0);
  const kurinTitle = kurin
    ? `${kurin.kurinNumber ? `Курінь ч.${kurin.kurinNumber}` : 'Підготовчий курінь'} ${kurin.name.replace(/^курінь\s+/i, '')}`
    : '';

  return (
    <div className="sm:flex sm:min-h-screen">
      <SidebarNav nav={nav} profile={profile} role={session.role} kurinTitle={kurinTitle} pathname={pathname} />
      <div className="min-w-0 flex-1">
        <MobileHeader profile={profile} kurinTitle={kurinTitle} />
        <main className="p-4 pb-32 sm:p-8">{children}</main>
      </div>
      <BottomNav nav={nav} pathname={pathname} />
    </div>
  );
}
