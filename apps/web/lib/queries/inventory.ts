'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload } from '@/lib/api-client';
import type { InventoryItem, InventoryItemPhoto } from '@/lib/types';

export function useInventory(kurinId: string | undefined) {
  return useQuery({
    queryKey: ['inventory', kurinId],
    queryFn: () => apiFetch<InventoryItem[]>(`/kurins/${kurinId}/inventory`),
    enabled: !!kurinId,
  });
}

export function useCreateInventoryItem(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; quantity: number; photos: File[] }) => {
      const formData = new FormData();
      formData.append('name', data.name);
      if (data.description) formData.append('description', data.description);
      formData.append('quantity', String(data.quantity));
      data.photos.forEach((photo) => formData.append('photos', photo));
      return apiUpload<InventoryItem>(`/kurins/${kurinId}/inventory`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', kurinId] });
    },
  });
}

export function useUpdateInventoryItem(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      ...data
    }: {
      itemId: string;
      name?: string;
      description?: string;
      quantity?: number;
    }) =>
      apiFetch<InventoryItem>(`/kurins/${kurinId}/inventory/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', kurinId] });
    },
  });
}

export function useDeleteInventoryItem(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => apiFetch(`/kurins/${kurinId}/inventory/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', kurinId] });
    },
  });
}

export function useAddInventoryPhoto(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, photo }: { itemId: string; photo: File }) => {
      const formData = new FormData();
      formData.append('photo', photo);
      return apiUpload<InventoryItemPhoto>(`/kurins/${kurinId}/inventory/${itemId}/photos`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', kurinId] });
    },
  });
}

export function useRemoveInventoryPhoto(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, photoId }: { itemId: string; photoId: string }) =>
      apiFetch(`/kurins/${kurinId}/inventory/${itemId}/photos/${photoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', kurinId] });
    },
  });
}
