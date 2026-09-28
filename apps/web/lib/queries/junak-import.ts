'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { JunakImportStatus } from '@/lib/types';

export function useJunakImportStatus(kurinId: string | undefined) {
  return useQuery({
    queryKey: ['junak-import-status', kurinId],
    queryFn: () => apiFetch<JunakImportStatus>(`/kurins/${kurinId}/junak-import/status`),
    enabled: !!kurinId,
  });
}

export function useSetJunakImportSpreadsheet(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { spreadsheetId: string; spreadsheetName: string }) =>
      apiFetch(`/kurins/${kurinId}/junak-import/spreadsheet`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['junak-import-status', kurinId] });
    },
  });
}

export function useJunakImportSheetData(kurinId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['junak-import-sheet-data', kurinId],
    queryFn: () => apiFetch<{ rows: string[][] }>(`/kurins/${kurinId}/junak-import/sheet-data`),
    enabled: !!kurinId && enabled,
  });
}

export function useSaveJunakImportMapping(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      columnMapping: { column: string; header: string; field: string }[];
      positionValueMapping: { rawValue: string; positionType: string | null }[];
    }) =>
      apiFetch(`/kurins/${kurinId}/junak-import/mapping`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['junak-import-status', kurinId] });
    },
  });
}
