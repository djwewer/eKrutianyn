import Link from 'next/link';
import Image from 'next/image';
import { Avatar } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import type { UserDetail } from '@/lib/types';

export function MobileHeader({ profile, kurinTitle }: { profile: UserDetail | undefined; kurinTitle: string }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:hidden">
      <Link href="/news" className="flex min-w-0 items-center gap-3">
        <Image src="/logo.webp" alt="" width={36} height={36} className="size-9 shrink-0 rounded-md" />
        <span className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold tracking-wide text-accent">єПластун</span>
          {kurinTitle && <span className="truncate text-[15px] font-bold tracking-tight">{kurinTitle}</span>}
        </span>
      </Link>
      <Link href="/me" aria-label="Моя сторінка" className="shrink-0">
        {profile && (
          <Avatar
            initials={getInitials(profile.firstName, profile.lastName)}
            photoUrl={profile.photoUpdatedAt ? `/api/backend/users/${profile.id}/photo?v=${profile.photoUpdatedAt}` : null}
          />
        )}
      </Link>
    </header>
  );
}
