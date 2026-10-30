'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api-client';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [queryClient] = useState(
    () => {
      const onUnauthorized = (error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          router.push('/login');
        }
      };
      return new QueryClient({
        queryCache: new QueryCache({
          onError: onUnauthorized,
        }),
        mutationCache: new MutationCache({
          onError: onUnauthorized,
        }),
        defaultOptions: {
          // staleTime + no focus refetch: otherwise every tab returning to focus
          // refires every query on the page (refetch storm at ~200 users).
          queries: { retry: false, staleTime: 60_000, refetchOnWindowFocus: false, refetchOnReconnect: 'always' },
        },
      });
    },
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
