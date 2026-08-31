'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Hurtok, HurtokBoard } from '@/lib/types';

export function useHurtky() {
  return useQuery({
    queryKey: ['hurtky'],
    queryFn: () => apiFetch<Hurtok[]>('/hurtky'),
  });
}

export function useHurtokBoard(hurtokId: string | undefined) {
  return useQuery({
    queryKey: ['hurtky', hurtokId, 'board'],
    queryFn: () => apiFetch<HurtokBoard>(`/hurtky/${hurtokId}/board`),
    enabled: !!hurtokId,
  });
}

export function useConfirmPoint(hurtokId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ junakId, pointId }: { junakId: string; pointId: string }) =>
      apiFetch(`/junaky/${junakId}/progress/${pointId}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hurtky', hurtokId, 'board'] });
    },
  });
}

export function useUnconfirmPoint(hurtokId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ junakId, pointId }: { junakId: string; pointId: string }) =>
      apiFetch(`/junaky/${junakId}/progress/${pointId}/unconfirm`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hurtky', hurtokId, 'board'] });
    },
  });
}
