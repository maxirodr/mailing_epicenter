import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.ts';
import type { Label } from '../types/index.ts';

export function useLabels(mailboxId: number | null) {
  return useQuery<Label[]>({
    queryKey: ['labels', mailboxId],
    queryFn: async () => {
      const { data } = await api.get<Label[]>(
        `/api/mailboxes/${mailboxId}/labels`,
      );
      return data;
    },
    enabled: mailboxId !== null,
    staleTime: 5 * 60 * 1000,
  });
}

interface CreateLabelPayload {
  name: string;
  color?: string;
}

export function useCreateLabel(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<Label, Error, CreateLabelPayload>({
    mutationFn: async (payload) => {
      const { data } = await api.post<Label>(
        `/api/mailboxes/${mailboxId}/labels`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['labels', mailboxId] });
    },
  });
}

interface UpdateLabelPayload {
  labelId: number;
  name?: string;
  color?: string;
}

export function useUpdateLabel(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<Label, Error, UpdateLabelPayload>({
    mutationFn: async ({ labelId, ...payload }) => {
      const { data } = await api.patch<Label>(
        `/api/mailboxes/${mailboxId}/labels/${labelId}`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['labels', mailboxId] });
    },
  });
}

export function useDeleteLabel(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (labelId) => {
      await api.delete(`/api/mailboxes/${mailboxId}/labels/${labelId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['labels', mailboxId] });
    },
  });
}
