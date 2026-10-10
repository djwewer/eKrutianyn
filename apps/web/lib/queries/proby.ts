'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProbyProgram, JunakProgressResponse } from '@/lib/types';

export function useProbyProgram() {
  return useQuery({
    queryKey: ['proby-programs', 'current'],
    queryFn: () => apiFetch<ProbyProgram>('/proby-programs/current'),
  });
}

export function useJunakProgress(junakId: string | undefined) {
  return useQuery({
    queryKey: ['junaky', junakId, 'progress'],
    queryFn: () => apiFetch<JunakProgressResponse>(`/junaky/${junakId}/progress`),
    enabled: !!junakId,
  });
}

export function useConfirmPoint(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pointId: string) =>
      apiFetch(`/junaky/${junakId}/progress/${pointId}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['junaky', junakId, 'progress'] });
    },
  });
}

export function useUnconfirmPoint(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pointId: string) =>
      apiFetch(`/junaky/${junakId}/progress/${pointId}/unconfirm`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['junaky', junakId, 'progress'] });
    },
  });
}

export function useCloseStage(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // `date` (YYYY-MM-DD) is when the degree was actually earned; omitted means today.
    mutationFn: ({ stageId, date }: { stageId: string; date?: string }) =>
      apiFetch(`/junaky/${junakId}/progress/stages/${stageId}/close`, {
        method: 'POST',
        body: JSON.stringify(date ? { date } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['junaky', junakId, 'progress'] });
      queryClient.invalidateQueries({ queryKey: ['junak-degrees', junakId] });
    },
  });
}

export function useReopenStage(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) =>
      apiFetch(`/junaky/${junakId}/progress/stages/${stageId}/reopen`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['junaky', junakId, 'progress'] });
    },
  });
}
