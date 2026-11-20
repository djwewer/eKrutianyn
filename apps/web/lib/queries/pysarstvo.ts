'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export function useCreateApd(kurinId: string) {
  return useMutation({
    mutationFn: (data: { title: string; pseudos: string[] }) =>
      apiFetch<{ id: string; url: string }>(`/kurins/${kurinId}/pysarstvo/apd`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}

export function usePseudoCandidates(kurinId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pysarstvo-pseudos', kurinId],
    queryFn: () => apiFetch<{ id: string; label: string }[]>(`/kurins/${kurinId}/pysarstvo/pseudos`),
    enabled: !!kurinId && enabled,
  });
}

export interface PysarstvoFolderStatus {
  driveConnected: boolean;
  folderId?: string;
  folderName?: string;
}

export function usePysarstvoFolder(kurinId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pysarstvo-folder', kurinId],
    queryFn: () => apiFetch<PysarstvoFolderStatus>(`/kurins/${kurinId}/pysarstvo/folder`),
    enabled: !!kurinId && enabled,
  });
}

export function useSetPysarstvoFolder(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { folderId: string; folderName: string }) =>
      apiFetch<PysarstvoFolderStatus>(`/kurins/${kurinId}/pysarstvo/folder`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (status) => {
      queryClient.setQueryData(['pysarstvo-folder', kurinId], status);
    },
  });
}
