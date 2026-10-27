'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export function useCreateApd(kurinId: string) {
  return useMutation({
    mutationFn: (data: { title: string; pseudos: string[] }) =>
      apiFetch<{ id: string; url: string }>(`/kurins/${kurinId}/pysarstvo/apd`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}

export function usePseudoCandidates(kurinId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pysarstvo-pseudos', kurinId],
    queryFn: () => apiFetch<{ id: string; label: string }[]>(`/kurins/${kurinId}/pysarstvo/pseudos`),
    enabled: !!kurinId && enabled,
  });
}
