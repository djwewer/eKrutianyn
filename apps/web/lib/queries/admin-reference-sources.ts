'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { adminHeaders, type AdminCredentials } from '@/lib/queries/admin-credentials';
import type { AdminReferenceSource } from '@/lib/types';

const QUERY_KEY = ['admin', 'reference-sources'];

export function useAdminReferenceSources(credentials: AdminCredentials | null) {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<AdminReferenceSource[]>('/admin/reference-sources', { headers: adminHeaders(credentials!) }),
    enabled: !!credentials,
    retry: false,
  });
}

export function useCreateReferenceSource(credentials: AdminCredentials | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { url: string; label: string; probyPointId?: string | null }) =>
      apiFetch<AdminReferenceSource>('/admin/reference-sources', {
        method: 'POST',
        headers: adminHeaders(credentials!),
        body: JSON.stringify(dto),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteReferenceSource(credentials: AdminCredentials | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/admin/reference-sources/${id}`, { method: 'DELETE', headers: adminHeaders(credentials!) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useFetchReferenceSourceNow(credentials: AdminCredentials | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<AdminReferenceSource>(`/admin/reference-sources/${id}/fetch-now`, { method: 'POST', headers: adminHeaders(credentials!) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useFetchAllReferenceSourcesNow(credentials: AdminCredentials | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ succeeded: number; failed: number }>('/admin/reference-sources/fetch-all', {
        method: 'POST',
        headers: adminHeaders(credentials!),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
