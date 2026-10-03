'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { adminHeaders, type AdminCredentials } from '@/lib/queries/admin-credentials';
import type { AdminProbyProgram } from '@/lib/types';

export function useAdminProbyPrograms(credentials: AdminCredentials | null) {
  return useQuery({
    queryKey: ['admin', 'proby-programs'],
    queryFn: () => apiFetch<AdminProbyProgram[]>('/admin/proby-programs', { headers: adminHeaders(credentials!) }),
    enabled: !!credentials,
    retry: false,
  });
}

export function useUpdateProbyPointReference(credentials: AdminCredentials | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pointId, referenceText }: { pointId: string; referenceText: string | null }) =>
      apiFetch(`/admin/proby-points/${pointId}/reference`, {
        method: 'PATCH',
        headers: adminHeaders(credentials!),
        body: JSON.stringify({ referenceText }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'proby-programs'] });
    },
  });
}
