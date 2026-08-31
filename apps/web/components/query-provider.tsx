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
          queries: { retry: false },
        },
      });
    },
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
