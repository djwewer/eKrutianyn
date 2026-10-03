'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { TreasurySummary, TreasuryTransaction } from '@/lib/types';

export function useTreasury(kurinId: string | undefined) {
  return useQuery({
    queryKey: ['treasury', kurinId],
    queryFn: () => apiFetch<TreasurySummary>(`/kurins/${kurinId}/treasury`),
    enabled: !!kurinId,
  });
}

export function useUpdateStartingBalance(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (startingBalanceCents: number) =>
      apiFetch<TreasurySummary>(`/kurins/${kurinId}/treasury/starting-balance`, {
        method: 'PATCH',
        body: JSON.stringify({ startingBalanceCents }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['treasury', kurinId] }),
  });
}

export function useCreateTransaction(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: 'INCOME' | 'EXPENSE'; amountCents: number; description: string; occurredAt: string }) =>
      apiFetch<TreasuryTransaction>(`/kurins/${kurinId}/treasury/transactions`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['treasury', kurinId] }),
  });
}

export function useDeleteTransaction(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transactionId: string) =>
      apiFetch<void>(`/kurins/${kurinId}/treasury/transactions/${transactionId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['treasury', kurinId] }),
  });
}
