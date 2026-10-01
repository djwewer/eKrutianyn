'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { Hurtok, HurtokMembers } from '@/lib/types';

export function useHurtky() {
  return useQuery({
    queryKey: ['hurtky'],
    queryFn: () => apiFetch<Hurtok[]>('/hurtky'),
  });
}

export function useHurtokBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ['hurtky', 'by-slug', slug],
    queryFn: () => apiFetch<HurtokMembers>(`/hurtky/by-slug/${slug}`),
    enabled: !!slug,
  });
}

export function useArchiveHurtok(id: string, slug: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<Hurtok>(`/hurtky/${id}/archive`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hurtky'] });
      queryClient.invalidateQueries({ queryKey: ['hurtky', 'by-slug', slug] });
    },
  });
}

export function useUpdateHurtok(id: string, slug: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { foundedAt: string | null }) =>
      apiFetch<Hurtok>(`/hurtky/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hurtky'] });
      queryClient.invalidateQueries({ queryKey: ['hurtky', 'by-slug', slug] });
    },
  });
}
