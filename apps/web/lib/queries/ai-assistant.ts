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
      queryClient.invalidateQueries({ queryKey: ['ai-assistant', 'conversations'], exact: true });
    },
  });
}

export function useDeleteAiConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      apiFetch<void>(`/ai-assistant/conversations/${conversationId}`, { method: 'DELETE' }),
    onSuccess: (_data, conversationId) => {
      queryClient.removeQueries({ queryKey: ['ai-assistant', 'conversations', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['ai-assistant', 'conversations'], exact: true });
    },
  });
}

// Takes conversationId per call (not per hook instance) so the same mutation can
// first create a conversation and then immediately send to the id it just got
// back, without needing to recreate the hook.
export function useSendAiMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, probyPointId, content }: { conversationId: string; probyPointId: string; content: string }) =>
      apiFetch<SendAiMessageResponse>(`/ai-assistant/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ probyPointId, content }),
      }),
    onSuccess: (data, variables) => {
      // Write the authoritative response straight into the conversation's cache
      // instead of invalidating-and-refetching — avoids a round trip and, more
      // importantly, avoids a flash where the just-sent exchange briefly
      // disappears while the refetch is in flight.
      queryClient.setQueryData(
        ['ai-assistant', 'conversations', variables.conversationId],
        (old: AiConversation | undefined) => ({
          id: variables.conversationId,
          title: old?.title ?? null,
          messages: data.messages,
        }),
      );
      // The first message sets the conversation's title and bumps its order —
      // refresh the sidebar list to reflect that.
      queryClient.invalidateQueries({ queryKey: ['ai-assistant', 'conversations'], exact: true });
    },
    onError: (_error, variables) => {
      // The backend still persists the user's message even when the OpenAI call
      // fails, so refetch rather than leaving the thread stale (and never
      // fabricate a local assistant message here).
      queryClient.invalidateQueries({ queryKey: ['ai-assistant', 'conversations', variables.conversationId] });
    },
  });
}
