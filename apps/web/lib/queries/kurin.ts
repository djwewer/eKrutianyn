'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Kurin } from '@/lib/types';

export function useKurin() {
  return useQuery({
    queryKey: ['kurin', 'me'],
    queryFn: () => apiFetch<Kurin>('/kurins/me'),
  });
}

export function useChangeProbyProgram(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: 'OLD' | 'NEW') =>
      apiFetch<Kurin>(`/kurins/${kurinId}/proby-program`, {
        method: 'PATCH',
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kurin', 'me'] });
    },
  });
}

export function useChangeKurinNumber(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newNumber: string) =>
      apiFetch<Kurin>(`/kurins/${kurinId}/kurin-number`, {
        method: 'PATCH',
        body: JSON.stringify({ newNumber }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kurin', 'me'] });
    },
  });
}
