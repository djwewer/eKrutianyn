'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { AdminReferenceSource } from '@/lib/types';

const QUERY_KEY = ['admin', 'reference-sources'];

export function useAdminReferenceSources(adminKey: string | null) {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<AdminReferenceSource[]>('/admin/reference-sources', { headers: { 'x-admin-key': adminKey! } }),
    enabled: !!adminKey,
    retry: false,
  });
}

export function useCreateReferenceSource(adminKey: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { url: string; label: string; probyPointId?: string | null }) =>
      apiFetch<AdminReferenceSource>('/admin/reference-sources', {
        method: 'POST',
        headers: { 'x-admin-key': adminKey! },
        body: JSON.stringify(dto),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteReferenceSource(adminKey: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/admin/reference-sources/${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey! } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useFetchReferenceSourceNow(adminKey: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<AdminReferenceSource>(`/admin/reference-sources/${id}/fetch-now`, { method: 'POST', headers: { 'x-admin-key': adminKey! } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useFetchAllReferenceSourcesNow(adminKey: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ succeeded: number; failed: number }>('/admin/reference-sources/fetch-all', {
        method: 'POST',
        headers: { 'x-admin-key': adminKey! },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
