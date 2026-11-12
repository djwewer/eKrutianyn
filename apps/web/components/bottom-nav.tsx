'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Briefcase } from 'lucide-react';
import { NavIcon } from '@/components/nav-icon';
import { isActive, type NavItem, type NavModel } from '@/lib/nav-model';
import { cn } from '@/lib/utils';

const ITEM =
  'relative grid min-w-0 content-start justify-items-center gap-[.1rem] rounded-md border-0 bg-transparent px-0 py-[.3rem] font-display text-[.66rem] font-semibold uppercase tracking-[.05em]';

function Label({ children }: { children: React.ReactNode }) {
  return <span className="max-w-full text-balance text-center leading-[1.1]">{children}</span>;
}

function Item({ item, active, badge = 0 }: { item: NavItem; active: boolean; badge?: number }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(ITEM, active ? 'text-navy' : 'text-ink-2')}
    >
      <NavIcon name={item.icon} className="size-[1.45rem]" />
      <Label>{item.label}</Label>
      {badge > 0 && (
        <>
          <span aria-hidden="true" className="absolute right-[22%] top-[.1rem] size-[.55rem] rounded-full bg-signal" />
          <span className="sr-only">, нових: {badge}</span>
        </>
      )}
    </Link>
  );
}

export function BottomNav({ nav, pathname }: { nav: NavModel; pathname: string | null }) {
  const [openOn, setOpenOn] = useState<string | null>(null);
  if (openOn !== null && openOn !== pathname) setOpenOn(null);
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
  const dilovodyActive = nav.dilovody.some((p) => isActive(p, pathname));
  const centerActive = isActive(nav.center, pathname);
  const columns = count > 0 ? 6 : 5;

  return (
    <div className="min-[761px]:hidden">
      {sheetOpen && count > 1 && (
        <button
          type="button"
          aria-label="Закрити"
          tabIndex={-1}
          className="fixed inset-0 z-[29] bg-black/40"
          onClick={() => setOpenOn(null)}
        />
      )}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-paper pt-[.3rem] pl-[max(4px,env(safe-area-inset-left,0px))] pr-[max(4px,env(safe-area-inset-right,0px))]"
        style={{
          paddingBottom: 'calc(0.3rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {sheetOpen && count > 1 && (
          <div
            ref={sheetRef}
            role="dialog"
            aria-label="Діловодство"
            className="absolute inset-x-0 bottom-full grid gap-[.3rem] rounded-t-xl bg-paper px-[max(16px,env(safe-area-inset-right,0px))] pb-4 pt-4"
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
                    'flex items-center gap-[.8rem] rounded-md border-b border-dashed border-line px-[.9rem] py-[.65rem] last:border-b-0',
                    active && 'bg-sky-soft text-sky-ink',
                  )}
                >
                  <NavIcon name={page.icon} className="size-[1.6rem] flex-none text-navy" />
                  <b className="text-base leading-tight">{page.label}</b>
                </Link>
              );
            })}
          </div>
        )}
        <nav
          aria-label="Основна навігація"
          className={cn(
            'grid gap-[.2rem]',
            // 5 columns keep the prototype's .05em tracking (from ITEM) on purpose; 6 columns need tracking-normal to fit.
            columns === 6
              ? '[&_a]:text-[.62rem] [&_a]:tracking-normal [&_button]:text-[.62rem] [&_button]:tracking-normal'
              : '[&_a]:text-[.66rem] [&_button]:text-[.66rem]',
          )}
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(min-content, 1fr))`,
          }}
        >
          <Item item={nav.left[0]} active={isActive(nav.left[0], pathname)} />
          <Item item={nav.left[1]} active={isActive(nav.left[1], pathname)} />
          <Link
            href={nav.center.href}
            aria-current={centerActive ? 'page' : undefined}
            className={cn(
              ITEM,
              '-mt-[.9rem] rounded-[50%_50%_8px_8px] bg-navy pt-[.55rem] text-navy-ink',
              centerActive && 'shadow-[0_0_0_3px_var(--sky)]',
            )}
          >
            <NavIcon name={nav.center.icon} className="size-[1.45rem]" />
            <Label>{nav.center.label}</Label>
          </Link>
          <Item item={nav.kurin} active={isActive(nav.kurin, pathname)} />
          {count === 1 && <Item item={nav.dilovody[0]} active={dilovodyActive} />}
          {count > 1 && (
            <button
              ref={triggerRef}
              type="button"
              aria-expanded={sheetOpen}
              aria-haspopup="dialog"
              onClick={() => setOpenOn(sheetOpen ? null : pathname)}
              className={cn(ITEM, 'cursor-pointer', dilovodyActive || sheetOpen ? 'text-navy' : 'text-ink-2')}
            >
              <Briefcase className="size-[1.45rem]" aria-hidden="true" />
              <Label>Діловодство</Label>
            </button>
          )}
          <Item item={nav.settings} active={isActive(nav.settings, pathname)} badge={nav.settings.badge} />
        </nav>
      </div>
    </div>
  );
}
