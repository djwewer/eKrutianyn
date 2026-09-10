'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { GuardianContact } from '@/lib/types';

export function useGuardianContacts(junakId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['guardian-contacts', junakId],
    queryFn: () => apiFetch<GuardianContact[]>(`/users/${junakId}/guardian-contacts`),
    enabled: options?.enabled ?? true,
  });
}

export function useAddGuardianContact(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; phone: string; role?: string; email?: string }) =>
      apiFetch<GuardianContact>(`/users/${junakId}/guardian-contacts`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardian-contacts', junakId] });
    },
  });
}

export function useUpdateGuardianContact(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      phone?: string;
      role?: string | null;
      email?: string | null;
    }) =>
      apiFetch<GuardianContact>(`/users/${junakId}/guardian-contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardian-contacts', junakId] });
    },
  });
}

export function useRemoveGuardianContact(junakId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/users/${junakId}/guardian-contacts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardian-contacts', junakId] });
    },
  });
}
