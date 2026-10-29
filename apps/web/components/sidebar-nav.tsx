'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Briefcase, ChevronDown } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { NavIcon } from '@/components/nav-icon';
import { isActive, type NavItem, type NavModel } from '@/lib/nav-model';
import { ROLE_LABELS } from '@/lib/role-labels';
import { cn, getInitials } from '@/lib/utils';
import type { Role, UserDetail } from '@/lib/types';

const ROW = 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors';
const ROW_IDLE = 'text-muted-foreground hover:bg-accent-soft hover:text-accent-text';
const ROW_ACTIVE = 'bg-accent-soft font-semibold text-accent-text';

function Row({ item, active, badge = 0 }: { item: NavItem; active: boolean; badge?: number }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(ROW, active ? ROW_ACTIVE : ROW_IDLE)}
    >
      <NavIcon name={item.icon} className="size-[18px] shrink-0" />
      <span className="flex-1">{item.label}</span>
      {badge > 0 && (
        <span className="flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-5 text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function SidebarNav({
  nav,
  profile,
  role,
  kurinTitle,
  pathname,
}: {
  nav: NavModel;
  profile: UserDetail | undefined;
  role: Role;
  kurinTitle: string;
  pathname: string | null;
}) {
  const groupActive = nav.dilovody.some((p) => isActive(p, pathname));
  const [open, setOpen] = useState(false);
  const expanded = open || groupActive;
  const centerActive = isActive(nav.center, pathname);

  return (
    <aside className="sticky top-0 hidden h-screen w-[250px] overflow-y-auto overscroll-contain shrink-0 flex-col gap-3.5 border-r border-border bg-popover px-3 py-[18px] sm:flex">
      <Link href="/news" className="flex min-w-0 items-center gap-3 px-1">
        <Image src="/logo.webp" alt="" width={36} height={36} className="size-9 shrink-0 rounded-md" />
        <span className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold tracking-wide text-accent">єПластун</span>
          {kurinTitle && <span className="truncate text-[15px] font-bold tracking-tight">{kurinTitle}</span>}
        </span>
      </Link>
      <nav aria-label="Основна навігація" className="flex flex-1 flex-col gap-1">
        <Link
          href={nav.center.href}
          aria-current={centerActive ? 'page' : undefined}
          className={cn(
            'mb-1 flex items-center gap-3 rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground',
            centerActive && 'ring-4 ring-accent-soft',
          )}
        >
          <NavIcon name={nav.center.icon} className="size-5 shrink-0" />
          {nav.center.label}
        </Link>
        {nav.left.map((item) => (
          <Row key={item.href} item={item} active={isActive(item, pathname)} />
        ))}
        <Row item={nav.kurin} active={isActive(nav.kurin, pathname)} />
        {nav.dilovody.length === 1 && <Row item={nav.dilovody[0]} active={groupActive} />}
        {nav.dilovody.length > 1 && (
          <div>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen((v) => !v)}
              className={cn(ROW, 'w-full text-left', groupActive ? ROW_ACTIVE : ROW_IDLE)}
            >
              <Briefcase className="size-[18px] shrink-0" aria-hidden="true" />
              <span className="flex-1">Діловодство</span>
              <ChevronDown
                className={cn('size-4 transition-transform', expanded && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
            {expanded && (
              <div className="ml-5 mt-1 flex flex-col gap-1 border-l border-border pl-2">
                {nav.dilovody.map((page) => (
                  <Row key={page.href} item={page} active={isActive(page, pathname)} />
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mt-auto flex flex-col gap-2">
          <Row item={nav.settings} active={isActive(nav.settings, pathname)} badge={nav.settings.badge} />
          <Link
            href="/me"
            aria-label="Моя сторінка"
            className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-accent-soft"
          >
            {profile ? (
              <>
                <Avatar
                  initials={getInitials(profile.firstName, profile.lastName)}
                  photoUrl={
                    profile.photoUpdatedAt ? `/api/backend/users/${profile.id}/photo?v=${profile.photoUpdatedAt}` : null
                  }
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">
                    {profile.firstName} {profile.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
                </span>
              </>
            ) : (
              <span className="h-8" />
            )}
          </Link>
        </div>
      </nav>
    </aside>
  );
}
