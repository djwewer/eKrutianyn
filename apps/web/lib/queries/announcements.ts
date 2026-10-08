'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload } from '@/lib/api-client';
import type { Announcement, ReactionEmoji } from '@/lib/types';

export function useAnnouncements(kurinId: string | undefined) {
  return useQuery({
    queryKey: ['announcements', kurinId],
    queryFn: () => apiFetch<Announcement[]>(`/kurins/${kurinId}/announcements`),
    enabled: !!kurinId,
  });
}

export function useCreateAnnouncement(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; content: Record<string, unknown>; imageIds: string[] }) =>
      apiFetch<Announcement>(`/kurins/${kurinId}/announcements`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements', kurinId] }),
  });
}

export function useUpdateAnnouncement(kurinId: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; content: Record<string, unknown>; imageIds: string[] }) =>
      apiFetch<Announcement>(`/kurins/${kurinId}/announcements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements', kurinId] }),
  });
}

export function useDeleteAnnouncement(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/kurins/${kurinId}/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements', kurinId] }),
  });
}

export function useUploadAnnouncementImage(kurinId: string) {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('image', file);
      return apiUpload<{ id: string }>(`/kurins/${kurinId}/announcements/images`, formData);
    },
  });
}

export function useSetReaction(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ announcementId, emoji }: { announcementId: string; emoji: ReactionEmoji }) =>
      apiFetch<void>(`/kurins/${kurinId}/announcements/${announcementId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements', kurinId] }),
  });
}

export function useRemoveReaction(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (announcementId: string) =>
      apiFetch<void>(`/kurins/${kurinId}/announcements/${announcementId}/reactions`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements', kurinId] }),
  });
}
