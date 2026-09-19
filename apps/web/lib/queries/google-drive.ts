'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { GoogleDriveStatus } from '@/lib/types';

export function useGoogleDriveStatus(kurinId: string | undefined) {
  return useQuery({
    queryKey: ['google-drive-status', kurinId],
    queryFn: () => apiFetch<GoogleDriveStatus>(`/kurins/${kurinId}/google-drive/status`),
    enabled: !!kurinId,
  });
}

export function useConnectGoogleDrive(kurinId: string) {
  return useMutation({
    mutationFn: async () => {
      const { url } = await apiFetch<{ url: string }>(`/kurins/${kurinId}/google-drive/connect`);
      window.location.href = url;
    },
  });
}

export async function fetchGoogleDrivePickerToken(kurinId: string): Promise<string> {
  const { accessToken } = await apiFetch<{ accessToken: string }>(`/kurins/${kurinId}/google-drive/picker-token`);
  return accessToken;
}

export function useSetGoogleDriveFolder(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { folderId: string; folderName: string }) =>
      apiFetch(`/kurins/${kurinId}/google-drive/folder`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-drive-status', kurinId] });
    },
  });
}
