import {
  Boxes, Briefcase, CalendarDays, Coins, Flag, Newspaper, PenLine, Scale, SlidersHorizontal, Tent, Users,
  type LucideIcon,
} from 'lucide-react';
import type { NavIconName } from '@/lib/nav-model';

const ICONS: Record<NavIconName, LucideIcon> = {
  news: Newspaper,
  calendar: CalendarDays,
  flag: Flag,
  users: Users,
  tent: Tent,
  briefcase: Briefcase,
  settings: SlidersHorizontal,
  inventory: Boxes,
  scale: Scale,
  pen: PenLine,
  coins: Coins,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden="true" />;
}
