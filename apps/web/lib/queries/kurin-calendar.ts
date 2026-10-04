'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { KurinCalendarEvent } from '@/lib/types';

export function useKurinCalendar(kurinId: string | undefined) {
  return useQuery({
    queryKey: ['kurin-calendar', kurinId],
    queryFn: () => apiFetch<KurinCalendarEvent[]>(`/kurins/${kurinId}/calendar-events`),
    enabled: !!kurinId,
  });
}

export function useCreateCalendarEvent(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; description?: string; startDate: string; endDate?: string }) =>
      apiFetch<KurinCalendarEvent>(`/kurins/${kurinId}/calendar-events`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kurin-calendar', kurinId] }),
  });
}

export function useDeleteCalendarEvent(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => apiFetch<void>(`/kurins/${kurinId}/calendar-events/${eventId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kurin-calendar', kurinId] }),
  });
}
