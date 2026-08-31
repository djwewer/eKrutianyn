'use client';

import { useQuery } from '@tanstack/react-query';
import type { CurrentUserPayload } from '@/lib/types';

async function fetchSession(): Promise<CurrentUserPayload | null> {
  const res = await fetch('/api/session');
  return res.json();
}

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: fetchSession,
  });
}
