'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { AiConversation, AiConversationSummary, SendAiMessageResponse } from '@/lib/types';

export function useAiConversations() {
  return useQuery({
    queryKey: ['ai-assistant', 'conversations'],
    queryFn: () => apiFetch<AiConversationSummary[]>('/ai-assistant/conversations'),
  });
}

export function useAiConversation(conversationId: string | null) {
  return useQuery({
    queryKey: ['ai-assistant', 'conversations', conversationId],
    queryFn: () => apiFetch<AiConversation>(`/ai-assistant/conversations/${conversationId}`),
    enabled: !!conversationId,
  });
}

export function useCreateAiConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<AiConversation>('/ai-assistant/conversations', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-assistant', 'conversations'] });
    },
  });
}

export function useSendAiMessage(conversationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { probyPointId: string; content: string }) =>
      apiFetch<SendAiMessageResponse>(`/ai-assistant/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
    onSettled: () => {
      // Invalidate regardless of outcome: the backend persists the user's message
      // even when the OpenAI call fails, so a failed send must still refresh the
      // thread (otherwise the user's own message is missing and retrying would
      // create a duplicate stored message). Also refresh the sidebar list, since
      // the first message in a conversation sets its title and bumps its order.
      // A non-exact match on this prefix invalidates both the list query and this
      // specific conversation's query in one call.
      queryClient.invalidateQueries({ queryKey: ['ai-assistant', 'conversations'] });
    },
  });
}
