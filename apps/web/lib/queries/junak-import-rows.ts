'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { JunakImportRowResult } from '@/lib/types';

export function useMatchCandidates(kurinId: string | undefined, firstName: string, lastName: string) {
  return useQuery({
    queryKey: ['junak-import-match-candidates', kurinId, firstName, lastName],
    queryFn: () =>
      apiFetch<{ candidates: { id: string; firstName: string; lastName: string; birthDate: string | null }[] }>(
        `/kurins/${kurinId}/junak-import/match-candidates?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}`,
      ),
    enabled: !!kurinId && !!firstName && !!lastName,
  });
}

export function useImportJunakRows(kurinId: string) {
  return useMutation({
    mutationFn: (rows: unknown[]) =>
      apiFetch<{ results: JunakImportRowResult[] }>(`/kurins/${kurinId}/junak-import/rows`, {
        method: 'POST',
        body: JSON.stringify({ rows }),
      }),
  });
}
