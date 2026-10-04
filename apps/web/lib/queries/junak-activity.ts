'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { JunakActivityEntry } from '@/lib/types';

const QUERY_KEY = ['junak-activity'];

export function useJunakActivity(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<JunakActivityEntry[]>('/users/me/activity'),
    enabled,
  });
}

export function useCreateActivityEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; occurredAt: string; role: 'PARTICIPANT' | 'PROVID'; description?: string }) =>
      apiFetch<JunakActivityEntry>('/users/me/activity', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteActivityEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/users/me/activity/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
