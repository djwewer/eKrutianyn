'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { DegreeKey, JunakDegrees } from '@/lib/types';

export function useJunakDegrees(junakId: string | undefined) {
  return useQuery({
    queryKey: ['junak-degrees', junakId],
    queryFn: () => apiFetch<JunakDegrees>(`/users/${junakId}/degrees`),
    enabled: !!junakId,
  });
}

/** Sets (or, for SKOB only, clears with `date: null`) the date a degree was earned. */
export function useSetDegreeDate(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, date }: { key: DegreeKey; date: string | null }) =>
      apiFetch<JunakDegrees>(`/users/${junakId}/degrees/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ date }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['junak-degrees', junakId], data);
      queryClient.invalidateQueries({ queryKey: ['junaky', junakId, 'progress'] });
    },
  });
}
