'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';

const HOME_BY_ROLE: Record<string, string> = {
  JUNAK: '/proby',
  VYKHOVNYK: '/hurtky',
  ZVYAZKOVYI: '/approval-requests',
};

export default function HomePage() {
  const router = useRouter();
  const { data: session, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading && session) {
      router.replace(HOME_BY_ROLE[session.role] ?? '/login');
    }
  }, [session, isLoading, router]);

  return null;
}
