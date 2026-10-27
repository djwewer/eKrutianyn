'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { AuditGroup, AuditLogPage } from '@/lib/audit';

export interface AuditLogFilters {
  group?: AuditGroup;
  actorId?: string;
  from?: string;
  to?: string;
}

export function useAuditLog(kurinId: string | undefined, filters: AuditLogFilters, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: ['audit-log', kurinId, filters],
    enabled: !!kurinId && (options?.enabled ?? true),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
      if (pageParam) params.set('cursor', pageParam);
      const qs = params.toString();
      return apiFetch<AuditLogPage>(`/kurins/${kurinId}/audit-log${qs ? `?${qs}` : ''}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
