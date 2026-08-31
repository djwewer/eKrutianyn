'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ApprovalActionType, ApprovalRequest } from '@/lib/types';

export function useCreateApprovalRequest() {
  return useMutation({
    mutationFn: (data: { actionType: ApprovalActionType; junakId?: string; newData: Record<string, unknown> }) =>
      apiFetch<ApprovalRequest>('/approval-requests', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}
