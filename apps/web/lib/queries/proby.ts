'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProbyProgram, JunakProgress } from '@/lib/types';

export function useProbyProgram() {
  return useQuery({
    queryKey: ['proby-programs', 'current'],
    queryFn: () => apiFetch<ProbyProgram>('/proby-programs/current'),
  });
}

export function useJunakProgress(junakId: string | undefined) {
  return useQuery({
    queryKey: ['junaky', junakId, 'progress'],
    queryFn: () => apiFetch<JunakProgress[]>(`/junaky/${junakId}/progress`),
    enabled: !!junakId,
  });
}
