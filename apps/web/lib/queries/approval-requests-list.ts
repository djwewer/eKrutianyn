'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ApprovalRequest, ApprovalStatus } from '@/lib/types';

export function useApprovalRequests(status?: ApprovalStatus) {
  const query = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: ['approval-requests', status],
    queryFn: () => apiFetch<ApprovalRequest[]>(`/approval-requests${query}`),
  });
}

export function useApprovalRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['approval-requests', id],
    queryFn: () => apiFetch<ApprovalRequest>(`/approval-requests/${id}`),
    enabled: !!id,
  });
}

export function useApproveRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<ApprovalRequest>(`/approval-requests/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
    },
  });
}

export function useRejectRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<ApprovalRequest>(`/approval-requests/${id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
    },
  });
}
