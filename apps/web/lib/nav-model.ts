import type { CurrentUserPayload, PositionType } from '@/lib/types';

export type NavIconName =
  | 'news' | 'calendar' | 'flag' | 'users' | 'tent' | 'briefcase' | 'settings'
  | 'inventory' | 'scale' | 'pen' | 'coins';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  /** Додаткові префікси маршрутів, на яких пункт теж активний. */
  alsoActiveOn?: string[];
}

export interface NavModel {
  left: NavItem[];
  center: NavItem;
  kurin: NavItem;
  dilovody: NavItem[];
  settings: NavItem & { badge: number };
}

const DILOVODY_PAGES: (NavItem & { position: PositionType })[] = [
  { href: '/inventory', label: 'Облік реманенту', icon: 'inventory', position: 'INTENDANT' },
  { href: '/suddivstvo', label: 'Суддівство', icon: 'scale', position: 'SUDDIA' },
  { href: '/pysarstvo', label: 'Писарство', icon: 'pen', position: 'PYSAR' },
  { href: '/treasury', label: 'Скарбниця', icon: 'coins', position: 'SKARBNYK' },
];

export function isActive(item: NavItem, pathname: string | null): boolean {
  if (!pathname) return false;
  const prefixes = [item.href, ...(item.alsoActiveOn ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function buildNav(session: CurrentUserPayload, pendingRequests: number): NavModel {
  const center: NavItem =
    session.role === 'VYKHOVNYK'
      ? { href: '/my-hurtok', label: 'Мій гурток', icon: 'users' }
      : {
          href: '/plastuvannia',
          label: session.role === 'ZVYAZKOVYI' ? 'Моя проба' : 'Моє пластування',
          icon: 'flag',
          alsoActiveOn: ['/proby', '/ai-vykhovnyk', '/my-activity'],
        };

  const dilovody = DILOVODY_PAGES.filter(
    (page) =>
      session.role === 'ZVYAZKOVYI' || session.isKurinniy || session.positions.includes(page.position),
  ).map((page) => ({ href: page.href, label: page.label, icon: page.icon }));

  return {
    left: [
      { href: '/news', label: 'Новини', icon: 'news' },
      { href: '/calendar', label: 'Календар', icon: 'calendar' },
    ],
    center,
    kurin: { href: '/kurin', label: 'Курінь', icon: 'tent' },
    dilovody,
    settings: {
      href: '/settings',
      label: 'Налаштування',
      icon: 'settings',
      badge: session.role === 'ZVYAZKOVYI' ? pendingRequests : 0,
      alsoActiveOn: ['/approval-requests', '/audit-log'],
    },
  };
}
