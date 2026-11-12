'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Briefcase, ChevronDown } from 'lucide-react';
import { NavIcon } from '@/components/nav-icon';
import { isActive, type NavItem, type NavModel } from '@/lib/nav-model';
import { cn, getInitials } from '@/lib/utils';
import type { UserDetail } from '@/lib/types';

const TAB =
  'flex items-center gap-[.4rem] whitespace-nowrap rounded-t-md px-[.8rem] py-[.55rem] font-display text-[.86rem] font-semibold uppercase tracking-[.06em] transition-colors';
const TAB_IDLE = 'opacity-80 hover:opacity-100';
const TAB_ACTIVE = 'bg-background text-foreground opacity-100 shadow-[inset_0_3px_0_var(--sky)]';

function Tab({ item, active, badge = 0 }: { item: NavItem; active: boolean; badge?: number }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(TAB, active ? TAB_ACTIVE : TAB_IDLE)}
    >
      {item.label}
      {badge > 0 && (
        <span className="rounded-full bg-signal px-[.4rem] font-mono text-[.66rem] leading-[1.4] tracking-normal text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

function Dilovody({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  const [openOn, setOpenOn] = useState<string | null>(null);
  if (openOn !== null && openOn !== pathname) setOpenOn(null);
  const open = openOn !== null && openOn === pathname;
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const groupActive = items.some((p) => isActive(p, pathname));

  useEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom, left: rect.left });
    panelRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenOn(null);
        triggerRef.current?.focus();
      }
    }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpenOn(null);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpenOn(open ? null : pathname)}
        className={cn(TAB, groupActive ? TAB_ACTIVE : TAB_IDLE)}
      >
        <Briefcase className="size-4 shrink-0" aria-hidden="true" />
        Діловодство
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Діловодство"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-30 flex min-w-[14rem] flex-col rounded-b-md rounded-tr-md border border-line bg-paper p-1 text-foreground shadow-lg"
        >
          {items.map((page) => {
            const active = isActive(page, pathname);
            return (
              <Link
                key={page.href}
                href={page.href}
                onClick={() => setOpenOn(null)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded px-3 py-2 text-[.95rem]',
                  active ? 'bg-sky-soft font-bold text-sky-ink' : 'hover:bg-sky-soft',
                )}
              >
                <NavIcon name={page.icon} className="size-[18px] shrink-0 text-navy" />
                {page.label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export function BandHeader({
  nav,
  profile,
  kurin,
  pathname,
}: {
  nav: NavModel;
  profile: UserDetail | undefined;
  kurin: { name: string; kurinNumber: string | null; stanytsia: string } | undefined;
  pathname: string | null;
}) {
  const number = kurin?.kurinNumber ?? null;
  const name = kurin ? kurin.name.replace(/^курінь\s+/i, '') : '';
  const subtitle = !kurin
    ? ''
    : number
      ? `КУРІНЬ Ч. ${number} · СТАНИЦЯ ${kurin.stanytsia.toLocaleUpperCase('uk')}`
      : 'ПІДГОТОВЧИЙ КУРІНЬ';
  const initials = profile ? getInitials(profile.firstName, profile.lastName) : '';
  const photoUrl = profile?.photoUpdatedAt
    ? `/api/backend/users/${profile.id}/photo?v=${profile.photoUpdatedAt}`
    : null;
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const photoFailed = failedPhotoUrl === photoUrl;

  return (
    <header className="sticky top-0 z-[15] bg-band pt-[env(safe-area-inset-top,0px)] text-band-ink">
      <div className="mx-auto max-w-[72rem] pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))] pt-[.7rem]">
        <div className="flex items-center gap-[.8rem] pb-[.55rem]">
          <Link
            href="/news"
            className="flex min-w-0 flex-1 items-center gap-[.8rem]"
            aria-label={kurin ? undefined : 'єПластун'}
          >
            <div className="grid size-[2.7rem] flex-none place-items-center rounded-full border-2 border-dashed border-current text-center leading-none">
              {number ? (
                <div>
                  <b className="block font-display text-[.9rem] font-bold leading-none">{number}</b>
                  <span className="block font-mono text-[.45rem] leading-none tracking-[.08em]">КУРІНЬ</span>
                </div>
              ) : (
                <b className="font-display text-[.9rem] font-bold leading-none">ПК</b>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate font-display text-[1.3rem] font-bold uppercase leading-none tracking-[.03em]">
                {name}
              </p>
              {subtitle && (
                <p className="m-0 mt-[.15rem] truncate font-mono text-[.68rem] tracking-[.04em] opacity-85">
                  {subtitle}
                </p>
              )}
            </div>
          </Link>
          <Link
            href="/me"
            aria-label="Моя сторінка"
            className="flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,currentColor_12%,transparent)] p-[.15rem] min-[761px]:py-[.15rem] min-[761px]:pl-[.15rem] min-[761px]:pr-[.6rem]"
          >
            <span className="grid size-8 place-items-center overflow-hidden rounded-full bg-band-ink font-display text-[.75rem] font-bold text-band">
              {photoUrl && !photoFailed ? (
                <img src={photoUrl} alt="" className="size-full object-cover" onError={() => setFailedPhotoUrl(photoUrl)} />
              ) : (
                initials
              )}
            </span>
            {profile && (
              <span className="hidden whitespace-nowrap text-[.82rem] font-bold min-[761px]:inline">
                {profile.firstName}
              </span>
            )}
          </Link>
        </div>
        <nav
          aria-label="Основна навігація"
          className="hidden gap-[.15rem] overflow-x-auto [scrollbar-width:none] min-[761px]:flex"
        >
          {nav.left.map((item) => (
            <Tab key={item.href} item={item} active={isActive(item, pathname)} />
          ))}
          <Tab item={nav.center} active={isActive(nav.center, pathname)} />
          <Tab item={nav.kurin} active={isActive(nav.kurin, pathname)} />
          {nav.dilovody.length > 0 && <span aria-hidden="true" className="my-[.55rem] mx-[.35rem] w-px flex-none bg-current opacity-30" />}
          {nav.dilovody.length === 1 && <Tab item={nav.dilovody[0]} active={isActive(nav.dilovody[0], pathname)} />}
          {nav.dilovody.length > 1 && <Dilovody items={nav.dilovody} pathname={pathname} />}
          <span aria-hidden="true" className="my-[.55rem] mx-[.35rem] w-px flex-none bg-current opacity-30" />
          <Tab item={nav.settings} active={isActive(nav.settings, pathname)} badge={nav.settings.badge} />
        </nav>
      </div>
    </header>
  );
}
