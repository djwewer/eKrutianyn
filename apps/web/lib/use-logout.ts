'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    queryClient.clear();
    router.push('/login');
    router.refresh();
  };
}
