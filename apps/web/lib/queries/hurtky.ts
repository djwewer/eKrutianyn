'use client';

import { useQuery } from '@tanstack/react-query';
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
