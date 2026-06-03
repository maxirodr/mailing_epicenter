import { useQuery } from '@tanstack/react-query';
import api from '../services/api.ts';
import type { Mailbox } from '../types/index.ts';

export function useMailboxes() {
  return useQuery<Mailbox[]>({
    queryKey: ['mailboxes'],
    queryFn: async () => {
      const { data } = await api.get<Mailbox[]>('/api/mailboxes');
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
