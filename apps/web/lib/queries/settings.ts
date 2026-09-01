'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { UserDetail } from '@/lib/types';

export function useOwnProfile() {
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => apiFetch<UserDetail>('/users/me'),
  });
}

export function useUpdateOwnProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      nickname?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      birthDate?: string;
    }) => apiFetch<UserDetail>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword?: string; newPassword: string }) =>
      apiFetch<{ ok: true }>('/users/me/password', { method: 'PATCH', body: JSON.stringify(data) }),
  });
}

export function useRequestEmailChange() {
  return useMutation({
    mutationFn: (data: { newEmail: string; currentPassword: string }) =>
      apiFetch<{ ok: true }>('/users/me/email', { method: 'PATCH', body: JSON.stringify(data) }),
  });
}
