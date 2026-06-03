import { useQuery } from '@tanstack/react-query';
import api from '../services/api.ts';

export function useCounts(mailboxId: number | null) {
  return useQuery<Record<string, number>>({
    queryKey: ['counts', mailboxId],
    queryFn: async () => {
      const { data } = await api.get<Record<string, number>>(
        `/api/mailboxes/${mailboxId}/counts`,
      );
      return data;
    },
    enabled: mailboxId !== null,
    refetchInterval: 30000,
    staleTime: 10000,
  });
}
