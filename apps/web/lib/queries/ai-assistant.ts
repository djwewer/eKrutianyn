'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { AiConversation, SendAiMessageResponse } from '@/lib/types';

export function useAiConversation() {
  return useQuery({
    queryKey: ['ai-assistant', 'conversation'],
    queryFn: () => apiFetch<AiConversation>('/ai-assistant/conversation'),
  });
}

export function useSendAiMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { probyPointId: string; content: string }) =>
      apiFetch<SendAiMessageResponse>('/ai-assistant/messages', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-assistant', 'conversation'] });
    },
  });
}
