'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload } from '@/lib/api-client';
import type { UserDetail } from '@/lib/types';

export function useOwnProfile(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => apiFetch<UserDetail>('/users/me'),
    enabled: options?.enabled ?? true,
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { currentPassword?: string; newPassword: string }) =>
      apiFetch<{ ok: true }>('/users/me/password', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      // Clears mustChangePassword in the cached profile immediately, so the
      // forced-change gate in Nav releases without waiting for a refetch.
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
  });
}

export function useRequestEmailChange() {
  return useMutation({
    mutationFn: (data: { newEmail: string; currentPassword: string }) =>
      apiFetch<{ ok: true }>('/users/me/email', { method: 'PATCH', body: JSON.stringify(data) }),
  });
}

export function useUpdateOwnPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('photo', file);
      return apiUpload<{ ok: true }>('/users/me/photo', formData, 'PATCH');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useRemoveOwnPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/users/me/photo', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
