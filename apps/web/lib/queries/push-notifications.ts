'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export function useSaveSubscription() {
  return useMutation({
    mutationFn: (subscription: PushSubscriptionJSON) =>
      apiFetch<void>('/push-subscriptions', {
        method: 'POST',
        body: JSON.stringify(subscription),
      }),
  });
}

export function useRemoveSubscription() {
  return useMutation({
    mutationFn: (endpoint: string) =>
      apiFetch<void>('/push-subscriptions', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint }),
      }),
  });
}
