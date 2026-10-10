'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { UserSummary, UserDetail, Role } from '@/lib/types';

export function useUsers(filters: { role?: Role; hurtokId?: string } = {}, options?: { enabled?: boolean }) {
  const queryParts = [];
  if (filters.role) queryParts.push(`role=${encodeURIComponent(filters.role)}`);
  if (filters.hurtokId) queryParts.push(`hurtokId=${encodeURIComponent(filters.hurtokId)}`);
  const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => apiFetch<UserSummary[]>(`/users${query}`),
    enabled: options?.enabled ?? true,
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
    mutationFn: (data: { notes?: string; phone?: string; residence?: string; studyPlace?: string }) =>
      apiFetch<UserDetail>(`/users/${id}/contact-info`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', id] });
    },
  });
}

export function useUpdateHurtok(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hurtokId: string | null) =>
      apiFetch<UserDetail>(`/users/${id}/hurtok`, {
        method: 'PATCH',
        body: JSON.stringify({ hurtokId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', id] });
    },
  });
}

export function useArchiveUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<UserDetail>(`/users/${id}/archive`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
