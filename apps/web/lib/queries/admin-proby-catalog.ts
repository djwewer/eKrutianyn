'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { AdminProbyProgram } from '@/lib/types';

export function useAdminProbyPrograms(adminKey: string | null) {
  return useQuery({
    queryKey: ['admin', 'proby-programs'],
    queryFn: () => apiFetch<AdminProbyProgram[]>('/admin/proby-programs', { headers: { 'x-admin-key': adminKey! } }),
    enabled: !!adminKey,
    retry: false,
  });
}

export function useUpdateProbyPointReference(adminKey: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pointId, referenceText }: { pointId: string; referenceText: string | null }) =>
      apiFetch(`/admin/proby-points/${pointId}/reference`, {
        method: 'PATCH',
        headers: { 'x-admin-key': adminKey! },
        body: JSON.stringify({ referenceText }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'proby-programs'] });
    },
  });
}
