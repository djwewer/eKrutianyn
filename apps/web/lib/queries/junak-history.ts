'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { JunakSkill, JunakSkills } from '@/lib/types';

export const junakHistoryKey = (junakId: string) => ['junak-history', junakId] as const;

export function useJunakSkills(junakId: string | undefined) {
  return useQuery({
    queryKey: ['junak-history', junakId, 'skills'],
    queryFn: () => apiFetch<JunakSkills>(`/users/${junakId}/skills`),
    enabled: !!junakId,
  });
}

/** Every history change refreshes everything cached under ['junak-history', junakId]. */
function useHistoryMutation<TVars, TResult>(junakId: string, mutationFn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: junakHistoryKey(junakId) }),
  });
}

export interface JunakSkillInput {
  levelId: string;
  achievedAt: string;
  examiner?: string;
  certificateNumber?: string;
}

export interface JunakSkillPatch {
  id: string;
  achievedAt?: string;
  examiner?: string | null;
  certificateNumber?: string | null;
}

export function useAddJunakSkill(junakId: string) {
  return useHistoryMutation(junakId, (dto: JunakSkillInput) =>
    apiFetch<JunakSkill>(`/users/${junakId}/skills`, { method: 'POST', body: JSON.stringify(dto) }),
  );
}

export function useUpdateJunakSkill(junakId: string) {
  return useHistoryMutation(junakId, ({ id, ...dto }: JunakSkillPatch) =>
    apiFetch<JunakSkill>(`/users/${junakId}/skills/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  );
}

export function useRemoveJunakSkill(junakId: string) {
  return useHistoryMutation(junakId, (id: string) =>
    apiFetch<{ success: true }>(`/users/${junakId}/skills/${id}`, { method: 'DELETE' }),
  );
}
