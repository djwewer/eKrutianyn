'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { VykhovnykAssignment } from '@/lib/types';

export function useVykhovnykAssignments(hurtokId?: string) {
  const query = hurtokId ? `?hurtokId=${hurtokId}` : '';
  return useQuery({
    queryKey: ['vykhovnyk-assignments', hurtokId],
    queryFn: () => apiFetch<VykhovnykAssignment[]>(`/vykhovnyk-assignments${query}`),
  });
}

export function useAssignVykhovnyk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { vykhovnykId: string; hurtokId: string }) =>
      apiFetch<VykhovnykAssignment>('/vykhovnyk-assignments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vykhovnyk-assignments'] });
    },
  });
}

export function useUnassignVykhovnyk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/vykhovnyk-assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vykhovnyk-assignments'] });
    },
  });
}
