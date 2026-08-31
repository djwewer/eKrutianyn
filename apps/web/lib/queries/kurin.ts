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
    mutationFn: (newProgramId: string) =>
      apiFetch<Kurin>(`/kurins/${kurinId}/proby-program`, {
        method: 'PATCH',
        body: JSON.stringify({ newProgramId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kurin', 'me'] });
    },
  });
}
