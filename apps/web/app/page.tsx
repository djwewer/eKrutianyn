'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-client';

export default function HomePage() {
  const router = useRouter();
  const { data: session, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading) {
      router.replace(session ? '/news' : '/login');
    }
  }, [session, isLoading, router]);

  return null;
}
