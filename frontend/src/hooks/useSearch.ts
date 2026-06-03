import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import api from '../services/api.ts';
import type { Thread, PaginatedResponse } from '../types/index.ts';

export interface SearchParams {
  q?: string;
  from?: string;
  to?: string;
  after?: string;
  before?: string;
  has_attachment?: boolean;
  is_unread?: boolean;
  category?: string;
  label?: string;
}

function hasActiveFilters(params: SearchParams): boolean {
  return !!(
    params.q ||
    params.from ||
    params.to ||
    params.after ||
    params.before ||
    params.has_attachment ||
    params.is_unread ||
    params.category ||
    params.label
  );
}

export function useSearch(mailboxId: number | null, params: SearchParams, page: number = 1) {
  const [debouncedParams, setDebouncedParams] = useState(params);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedParams(params);
    }, 300);
    return () => clearTimeout(timer);
  }, [params]);

  return useQuery<PaginatedResponse<Thread>>({
    queryKey: ['search', mailboxId, debouncedParams, page],
    queryFn: async () => {
      const queryParams: Record<string, string | number> = {};
      if (debouncedParams.q) queryParams.q = debouncedParams.q;
      if (debouncedParams.from) queryParams.from = debouncedParams.from;
      if (debouncedParams.to) queryParams.to = debouncedParams.to;
      if (debouncedParams.after) queryParams.after = debouncedParams.after;
      if (debouncedParams.before) queryParams.before = debouncedParams.before;
      if (debouncedParams.has_attachment) queryParams.has_attachment = '1';
      if (debouncedParams.is_unread) queryParams.is_unread = '1';
      if (debouncedParams.category) queryParams.category = debouncedParams.category;
      if (debouncedParams.label) queryParams.label = debouncedParams.label;
      if (page > 1) queryParams.page = page;

      const { data } = await api.get<PaginatedResponse<Thread>>(
        `/api/mailboxes/${mailboxId}/search`,
        { params: queryParams },
      );
      return data;
    },
    enabled: mailboxId !== null && hasActiveFilters(debouncedParams),
    staleTime: 30 * 1000,
  });
}
