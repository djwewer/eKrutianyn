'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { CustomSkillInput, Skill, SkillCatalogGroup } from '@/lib/types';

export function useSkillsCatalog() {
  return useQuery({
    queryKey: ['skills'],
    queryFn: () => apiFetch<SkillCatalogGroup[]>('/skills'),
  });
}

function useInvalidateSkills() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['skills'] });
}

export function useCreateSkill() {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: (dto: CustomSkillInput) => apiFetch<Skill>('/skills', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: invalidate,
  });
}

export function useUpdateSkill() {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: ({ id, ...dto }: CustomSkillInput & { id: string }) =>
      apiFetch<Skill>(`/skills/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
    onSuccess: invalidate,
  });
}

export function useDeleteSkill() {
  const invalidate = useInvalidateSkills();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ success: true }>(`/skills/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
