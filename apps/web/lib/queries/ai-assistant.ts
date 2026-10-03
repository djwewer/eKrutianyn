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
    onSettled: () => {
      // Invalidate regardless of outcome: the backend persists the user's message
      // even when the OpenAI call fails, so a failed send must still refresh the
      // thread (otherwise the user's own message is missing and retrying would
      // create a duplicate stored message).
      queryClient.invalidateQueries({ queryKey: ['ai-assistant', 'conversation'] });
    },
  });
}
