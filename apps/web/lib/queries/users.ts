'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { UserSummary, UserDetail, Role } from '@/lib/types';

export function useUsers(filters: { role?: Role; hurtokId?: string } = {}) {
  const queryParts = [];
  if (filters.role) queryParts.push(`role=${encodeURIComponent(filters.role)}`);
  if (filters.hurtokId) queryParts.push(`hurtokId=${encodeURIComponent(filters.hurtokId)}`);
  const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => apiFetch<UserSummary[]>(`/users${query}`),
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => apiFetch<UserDetail>(`/users/${id}`),
    enabled: !!id,
  });
}

export function useUpdateContactInfo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { notes?: string; phone?: string }) =>
      apiFetch<UserDetail>(`/users/${id}/contact-info`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', id] });
    },
  });
}
