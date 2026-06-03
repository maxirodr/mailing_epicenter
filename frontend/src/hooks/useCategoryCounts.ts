import { useQuery } from '@tanstack/react-query';
import api from '../services/api.ts';
import type { EmailCategory } from '../types/index.ts';

export function useCategoryCounts(mailboxId: number | null) {
  return useQuery<Record<EmailCategory, number>>({
    queryKey: ['categoryCounts', mailboxId],
    queryFn: async () => {
      const { data } = await api.get<Record<EmailCategory, number>>(
        `/api/mailboxes/${mailboxId}/category-counts`,
      );
      return data;
    },
    enabled: mailboxId !== null,
    refetchInterval: 30000,
    staleTime: 10000,
  });
}
