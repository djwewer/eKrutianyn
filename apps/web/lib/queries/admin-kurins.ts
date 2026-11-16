'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { adminHeaders, type AdminCredentials } from '@/lib/queries/admin-credentials';
import type { AdminKurin, InviteResult, KurinDeletePreview } from '@/lib/types';

const QUERY_KEY = ['admin', 'kurins'];

export function useAdminKurins(credentials: AdminCredentials | null) {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<AdminKurin[]>('/admin/kurins', { headers: adminHeaders(credentials!) }),
    enabled: !!credentials,
    retry: false,
  });
}

export function useCreateKurin(credentials: AdminCredentials | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      name: string;
      kurinNumber?: string;
      gender: 'MALE' | 'FEMALE';
      stanytsia: string;
      probyProgramId: string;
      zvyazkovyi: { firstName: string; lastName: string; email: string };
    }) =>
      apiFetch<AdminKurin & InviteResult>('/admin/kurins', {
        method: 'POST',
        headers: adminHeaders(credentials!),
        body: JSON.stringify(dto),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useResendZvyazkovyiInvite(credentials: AdminCredentials | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<InviteResult>(`/admin/users/${userId}/resend-invite`, {
        method: 'POST',
        headers: adminHeaders(credentials!),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateKurin(credentials: AdminCredentials | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, kurinNumber }: { id: string; name?: string; kurinNumber?: string }) =>
      apiFetch<AdminKurin>(`/admin/kurins/${id}`, {
        method: 'PATCH',
        headers: adminHeaders(credentials!),
        body: JSON.stringify({ name, kurinNumber }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteKurin(credentials: AdminCredentials | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/admin/kurins/${id}`, { method: 'DELETE', headers: adminHeaders(credentials!) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useSetKurinActive(credentials: AdminCredentials | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<{ id: string; deactivatedAt: string | null }>(`/admin/kurins/${id}/${active ? 'activate' : 'deactivate'}`, {
        method: 'POST',
        headers: adminHeaders(credentials!),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useKurinDeletePreview(credentials: AdminCredentials | null, id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...QUERY_KEY, id, 'delete-preview'],
    queryFn: () => apiFetch<KurinDeletePreview>(`/admin/kurins/${id}/delete-preview`, { headers: adminHeaders(credentials!) }),
    enabled: enabled && !!credentials,
    retry: false,
    gcTime: 0,
  });
}

export function useForceDeleteKurin(credentials: AdminCredentials | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmName }: { id: string; confirmName: string }) =>
      apiFetch<void>(`/admin/kurins/${id}/force`, {
        method: 'DELETE',
        headers: adminHeaders(credentials!),
        body: JSON.stringify({ confirmName }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
