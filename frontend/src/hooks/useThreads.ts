import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.ts';
import type { Thread, PaginatedResponse, EmailCategory } from '../types/index.ts';

export function useThreads(
  mailboxId: number | null,
  label?: string,
  page?: number,
  category?: string,
  isUnread?: boolean,
) {
  return useQuery<PaginatedResponse<Thread>>({
    queryKey: ['threads', mailboxId, label, page, category, isUnread],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (label) params.label = label;
      if (page) params.page = page;
      if (category) params.category = category;
      if (isUnread) params.is_unread = 1;
      const { data } = await api.get<PaginatedResponse<Thread>>(
        `/api/mailboxes/${mailboxId}/threads`,
        { params },
      );
      return data;
    },
    enabled: mailboxId !== null,
    staleTime: 30 * 1000,
  });
}

export function useThread(mailboxId: number | null, threadId: number | null) {
  return useQuery<Thread>({
    queryKey: ['thread', mailboxId, threadId],
    queryFn: async () => {
      const { data } = await api.get<Thread>(
        `/api/mailboxes/${mailboxId}/threads/${threadId}`,
      );
      return data;
    },
    enabled: mailboxId !== null && threadId !== null,
  });
}

interface UpdateThreadPayload {
  threadId: number;
  data: {
    is_read?: boolean;
    is_starred?: boolean;
    is_trashed?: boolean;
    is_spam?: boolean;
    category?: EmailCategory;
  };
}

export function useUpdateThread(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<Thread, Error, UpdateThreadPayload>({
    mutationFn: async ({ threadId, data: payload }) => {
      const { data } = await api.patch<Thread>(
        `/api/mailboxes/${mailboxId}/threads/${threadId}`,
        payload,
      );
      return data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['thread', mailboxId, variables.threadId] });
      void queryClient.invalidateQueries({ queryKey: ['counts', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['categoryCounts', mailboxId] });
    },
  });
}

export function useDeleteThread(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (threadId) => {
      await api.delete(`/api/mailboxes/${mailboxId}/threads/${threadId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['counts', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['categoryCounts', mailboxId] });
    },
  });
}

export function useNotSpam(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<Thread, Error, { threadId: number; trustSender?: boolean }>({
    mutationFn: async ({ threadId, trustSender }) => {
      const { data } = await api.post<Thread>(
        `/api/mailboxes/${mailboxId}/threads/${threadId}/not-spam`,
        { trust_sender: trustSender },
      );
      return data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['thread', mailboxId, variables.threadId] });
      void queryClient.invalidateQueries({ queryKey: ['counts', mailboxId] });
    },
  });
}

interface MarkAllReadPayload {
  category?: string;
  label?: string;
}

export function useMarkAllRead(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<{ count: number }, Error, MarkAllReadPayload>({
    mutationFn: async (payload) => {
      const params: Record<string, string> = {};
      if (payload.category) params.category = payload.category;
      if (payload.label) params.label = payload.label;
      const { data } = await api.post(`/api/mailboxes/${mailboxId}/threads/mark-all-read`, null, { params });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['counts', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['categoryCounts', mailboxId] });
    },
  });
}

interface BulkActionPayload {
  thread_ids: number[];
  action: 'read' | 'unread' | 'star' | 'unstar' | 'trash' | 'untrash' | 'delete' | 'spam' | 'not_spam' | 'label' | 'unlabel' | 'category';
  label_id?: number;
  category?: EmailCategory;
}

export function useEmptyTrash(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<{ count: number }, Error, void>({
    mutationFn: async () => {
      const { data } = await api.post(`/api/mailboxes/${mailboxId}/threads/empty-trash`);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['counts', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['categoryCounts', mailboxId] });
    },
  });
}

export function useBulkAction(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, BulkActionPayload>({
    mutationFn: async (payload) => {
      await api.post(`/api/mailboxes/${mailboxId}/threads/bulk`, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['counts', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['categoryCounts', mailboxId] });
    },
  });
}
