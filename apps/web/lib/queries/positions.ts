'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { KurinPosition, PositionScope, PositionType } from '@/lib/types';

export function useKurinPositions() {
  return useQuery({
    queryKey: ['kurin-positions'],
    queryFn: () => apiFetch<KurinPosition[]>('/kurin-positions'),
  });
}

export function useAssignPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { userId: string; scope: PositionScope; positionType: PositionType; hurtokId?: string }) =>
      apiFetch<KurinPosition>('/kurin-positions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kurin-positions'] });
    },
  });
}

export function useRemovePosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/kurin-positions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kurin-positions'] });
    },
  });
}
