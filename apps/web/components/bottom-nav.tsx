'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Briefcase } from 'lucide-react';
import { NavIcon } from '@/components/nav-icon';
import { isActive, type NavItem, type NavModel } from '@/lib/nav-model';
import { cn } from '@/lib/utils';

function Item({
  item,
  active,
  small,
  badge = 0,
}: {
  item: NavItem;
  active: boolean;
  small: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-col items-center gap-0.5 font-semibold',
        small ? 'text-[9px] tracking-tight' : 'text-[10.5px]',
        active ? 'text-accent-text' : 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'relative flex h-[30px] w-9 items-center justify-center rounded-[11px]',
          active && 'bg-primary text-primary-foreground',
        )}
      >
        <NavIcon name={item.icon} className="size-5" />
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-4 text-white">
            {badge}
          </span>
        )}
      </span>
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}

export function BottomNav({ nav, pathname }: { nav: NavModel; pathname: string | null }) {
  const [openOn, setOpenOn] = useState<string | null>(null);
  const sheetOpen = openOn !== null && openOn === pathname;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sheetOpen) return;
    sheetRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenOn(null);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sheetOpen]);

  const count = nav.dilovody.length;
  const hasDilovody = count > 0;
  const small = hasDilovody;
  const dilovodyActive = nav.dilovody.some((p) => isActive(p, pathname));
  const centerActive = isActive(nav.center, pathname);

  return (
    <div
      className="fixed inset-x-3 z-40 sm:hidden"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {sheetOpen && count > 1 && (
        <>
          <button
            type="button"
            aria-label="Закрити"
            tabIndex={-1}
            className="fixed inset-0 -z-10 bg-foreground/20"
            onClick={() => setOpenOn(null)}
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-label="Діловодство"
            className="absolute inset-x-0 bottom-full mb-2 flex flex-col rounded-[1.4rem] border border-border bg-popover p-2 shadow-lg"
          >
            {nav.dilovody.map((page) => {
              const active = isActive(page, pathname);
              return (
                <Link
                  key={page.href}
                  href={page.href}
                  onClick={() => setOpenOn(null)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                    active ? 'bg-accent-soft font-semibold text-accent-text' : 'text-foreground hover:bg-accent-soft',
                  )}
                >
                  <NavIcon name={page.icon} className="size-5" />
                  {page.label}
                </Link>
              );
            })}
          </div>
        </>
      )}
      <nav aria-label="Основна навігація">
        <div
          className={cn(
            'grid items-end rounded-[2rem] border border-border bg-popover px-1.5 py-2 shadow-lg',
            hasDilovody ? 'grid-cols-[1fr_1fr_4rem_1fr_1fr_1fr] gap-x-1' : 'grid-cols-[1fr_1fr_5.5rem_1fr_1fr]',
          )}
        >
          <Item item={nav.left[0]} active={isActive(nav.left[0], pathname)} small={small} />
          <Item item={nav.left[1]} active={isActive(nav.left[1], pathname)} small={small} />
          <Link
            href={nav.center.href}
            aria-current={centerActive ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center gap-0.5 font-semibold',
              small ? 'text-[9px] tracking-tight' : 'text-[10.5px]',
              centerActive ? 'text-accent-text' : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                '-mt-8 flex size-[62px] items-center justify-center rounded-full border-[5px] border-popover bg-primary text-primary-foreground',
                centerActive && 'ring-4 ring-accent-soft',
              )}
            >
              <NavIcon name={nav.center.icon} className="size-6" />
            </span>
            <span className="text-center leading-tight">{nav.center.label}</span>
          </Link>
          <Item item={nav.kurin} active={isActive(nav.kurin, pathname)} small={small} />
          {count === 1 && <Item item={nav.dilovody[0]} active={dilovodyActive} small={small} />}
          {count > 1 && (
            <button
              ref={triggerRef}
              type="button"
              aria-expanded={sheetOpen}
              aria-haspopup="dialog"
              onClick={() => setOpenOn(sheetOpen ? null : pathname)}
              className={cn(
                'flex flex-col items-center gap-0.5 text-[9px] font-semibold tracking-tight',
                dilovodyActive || sheetOpen ? 'text-accent-text' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-[30px] w-9 items-center justify-center rounded-[11px]',
                  (dilovodyActive || sheetOpen) && 'bg-primary text-primary-foreground',
                )}
              >
                <Briefcase className="size-5" aria-hidden="true" />
              </span>
              <span>Діловодство</span>
            </button>
          )}
          <Item
            item={nav.settings}
            active={isActive(nav.settings, pathname)}
            small={small}
            badge={nav.settings.badge}
          />
        </div>
      </nav>
    </div>
  );
}
