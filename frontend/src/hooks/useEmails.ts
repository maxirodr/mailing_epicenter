import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.ts';
import type { Email } from '../types/index.ts';

export interface SendEmailPayload {
  to_addresses: string[];
  cc_addresses?: string[];
  bcc_addresses?: string[];
  subject: string;
  html_body: string;
  attachment_ids?: number[];
  scheduled_at?: string;
}

export function useSendEmail(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<Email, Error, SendEmailPayload>({
    mutationFn: async (payload) => {
      const { data } = await api.post<Email>(
        `/api/mailboxes/${mailboxId}/emails`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
    },
  });
}

interface ReplyPayload {
  emailId: number;
  to_addresses: string[];
  cc_addresses?: string[];
  bcc_addresses?: string[];
  subject?: string;
  html_body: string;
  attachment_ids?: number[];
}

export function useReplyEmail(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<Email, Error, ReplyPayload>({
    mutationFn: async ({ emailId, ...payload }) => {
      const { data } = await api.post<Email>(
        `/api/mailboxes/${mailboxId}/emails/${emailId}/reply`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['thread', mailboxId] });
    },
  });
}

interface ForwardPayload {
  emailId: number;
  to_addresses: string[];
  cc_addresses?: string[];
  bcc_addresses?: string[];
  subject?: string;
  html_body: string;
  attachment_ids?: number[];
}

export function useForwardEmail(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<Email, Error, ForwardPayload>({
    mutationFn: async ({ emailId, ...payload }) => {
      const { data } = await api.post<Email>(
        `/api/mailboxes/${mailboxId}/emails/${emailId}/forward`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
    },
  });
}

interface SaveDraftPayload {
  draftId: number;
  to_addresses?: string[];
  cc_addresses?: string[];
  bcc_addresses?: string[];
  subject?: string;
  html_body?: string;
  attachment_ids?: number[];
}

export function useSaveDraft(mailboxId: number | null) {
  return useMutation<Email, Error, SaveDraftPayload>({
    mutationFn: async ({ draftId, ...payload }) => {
      const { data } = await api.put<Email>(
        `/api/mailboxes/${mailboxId}/drafts/${draftId}`,
        payload,
      );
      return data;
    },
  });
}

export function useCreateDraft(mailboxId: number | null) {
  const queryClient = useQueryClient();
  return useMutation<Email, Error, Partial<SendEmailPayload> & { reply_to_email_id?: number }>({
    mutationFn: async (payload) => {
      const { data } = await api.post<Email>(
        `/api/mailboxes/${mailboxId}/emails`,
        { ...payload, is_draft: true },
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
    },
  });
}

export function useSendDraft(mailboxId: number | null) {
  const queryClient = useQueryClient();
  return useMutation<Email, Error, { draftId: number } & Partial<SendEmailPayload>>({
    mutationFn: async ({ draftId, ...payload }) => {
      const { data } = await api.post<Email>(
        `/api/mailboxes/${mailboxId}/drafts/${draftId}/send`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['thread', mailboxId] });
    },
  });
}

export function useDeleteDraft(mailboxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (draftId) => {
      await api.delete(`/api/mailboxes/${mailboxId}/drafts/${draftId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
    },
  });
}

export function useCancelSend(mailboxId: number | null) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (emailId) => {
      await api.post(`/api/mailboxes/${mailboxId}/emails/${emailId}/cancel`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['counts', mailboxId] });
    },
  });
}

export function useSendScheduledNow(mailboxId: number | null) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (emailId) => {
      await api.post(`/api/mailboxes/${mailboxId}/emails/${emailId}/send-now`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', mailboxId] });
      void queryClient.invalidateQueries({ queryKey: ['counts', mailboxId] });
    },
  });
}
