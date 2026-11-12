'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import { useOwnProfile } from '@/lib/queries/settings';
import { useKurin } from '@/lib/queries/kurin';
import { useApprovalRequests } from '@/lib/queries/approval-requests-list';
import { buildNav } from '@/lib/nav-model';
import { BandHeader } from '@/components/band-header';
import { BottomNav } from '@/components/bottom-nav';
import { cn } from '@/lib/utils';

// Повноекранні сторінки автентифікації: без колонки та відступів.
const AUTH_ROUTES = ['/login', '/forgot-password', '/reset-password', '/confirm-email-change'];

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

  const isAuthRoute = AUTH_ROUTES.some((r) => pathname === r || pathname?.startsWith(`${r}/`));
  const nav = session ? buildNav(session, pending?.length ?? 0) : null;
  // Дерево стабільне незалежно від сесії: інакше, щойно сесія завантажиться,
  // children перемонтуються і втрачають введений стан (напр. поля форми входу).
  return (
    <div>
      {session && nav && <BandHeader nav={nav} profile={profile} kurin={kurin} pathname={pathname} />}
      <main
        className={
          isAuthRoute
            ? ''
            : cn(
                'mx-auto max-w-[52rem] pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))] pt-[1.4rem] min-[761px]:pb-12 [&:has([data-wide])]:max-w-[72rem]',
                session ? 'pb-[calc(8rem+env(safe-area-inset-bottom,0px))]' : 'pb-12',
              )
        }
      >
        {children}
      </main>
      {session && nav && <BottomNav nav={nav} pathname={pathname} />}
    </div>
  );
}

/** Сторінки, яким потрібна ширша колонка (до 72rem), обгортають вміст у цей компонент. */
export function WideContent({ children }: { children: React.ReactNode }) {
  return <div data-wide>{children}</div>;
}
