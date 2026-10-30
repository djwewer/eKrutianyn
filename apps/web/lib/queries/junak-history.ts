'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { JunakActivityRole, JunakCamp, JunakHistory, JunakSkill, JunakVfv } from '@/lib/types';

export const junakHistoryKey = (junakId: string) => ['junak-history', junakId] as const;

export function useJunakHistory(junakId: string | undefined) {
  return useQuery({
    queryKey: junakHistoryKey(junakId as string),
    queryFn: () => apiFetch<JunakHistory>(`/users/${junakId}/history`),
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

export interface VfvInput {
  achievedAt: string | null;
  note: string | null;
}

export function useAddVfv(junakId: string) {
  return useHistoryMutation(junakId, (dto: VfvInput) =>
    apiFetch<JunakVfv>(`/users/${junakId}/vfv`, { method: 'POST', body: JSON.stringify(dto) }),
  );
}

export function useUpdateVfv(junakId: string) {
  return useHistoryMutation(junakId, ({ id, ...dto }: VfvInput & { id: string }) =>
    apiFetch<JunakVfv>(`/users/${junakId}/vfv/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  );
}

export function useRemoveVfv(junakId: string) {
  return useHistoryMutation(junakId, (id: string) =>
    apiFetch<{ success: true }>(`/users/${junakId}/vfv/${id}`, { method: 'DELETE' }),
  );
}

export interface CampInput {
  name: string;
  yearFrom: number;
  yearTo: number | null;
  role: JunakActivityRole;
}

export function useAddCamp(junakId: string) {
  return useHistoryMutation(junakId, (dto: CampInput) =>
    apiFetch<JunakCamp>(`/users/${junakId}/camps`, { method: 'POST', body: JSON.stringify(dto) }),
  );
}

export function useUpdateCamp(junakId: string) {
  return useHistoryMutation(junakId, ({ id, ...dto }: CampInput & { id: string }) =>
    apiFetch<JunakCamp>(`/users/${junakId}/camps/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  );
}

export function useRemoveCamp(junakId: string) {
  return useHistoryMutation(junakId, (id: string) =>
    apiFetch<{ success: true }>(`/users/${junakId}/camps/${id}`, { method: 'DELETE' }),
  );
}
