import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import type {
  UserSession,
  LoginHistoryEntry,
  AutoReply,
  UserPreferences,
  PaginatedResponse,
} from '../types';

// ── Existing hooks ────────────────────────────────────────────────────

export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (payload: {
      current_password: string;
      password: string;
      password_confirmation: string;
    }) => {
      await api.put('/api/auth/password', payload);
    },
  });
}

export function useSetup2FA() {
  return useMutation<{ secret: string; qr_url: string }, Error>({
    mutationFn: async () => {
      const { data } = await api.post<{ secret: string; qr_url: string }>('/api/auth/2fa/totp/setup');
      return data;
    },
  });
}

export function useConfirm2FA() {
  const qc = useQueryClient();
  return useMutation<{ message: string; recovery_codes: string[] }, Error, { code: string }>({
    mutationFn: async (payload: { code: string }) => {
      const res = await api.post<{ message: string; recovery_codes: string[] }>('/api/auth/2fa/totp/confirm', payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name?: string;
      display_name?: string | null;
      timezone?: string;
      language?: string;
    }) => {
      const { data } = await api.put('/api/auth/profile', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useUpdateSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mailboxId, signature }: { mailboxId: number; signature: string | null }) => {
      const { data } = await api.patch(`/api/mailboxes/${mailboxId}/signature`, { signature });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailboxes'] });
    },
  });
}

// ── New hooks ─────────────────────────────────────────────────────────

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.post<{ avatar_url: string }>('/api/auth/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });
}

export function useSessions() {
  return useQuery<UserSession[]>({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => {
      const { data } = await api.get<UserSession[]>('/api/auth/sessions');
      return data;
    },
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/auth/sessions/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });
}

export function useRenameSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const { data } = await api.patch(`/api/auth/sessions/${id}`, { name });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });
}

export function useRevokeAllSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/api/auth/sessions');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });
}

export function useLoginHistory(page = 1) {
  return useQuery<PaginatedResponse<LoginHistoryEntry>>({
    queryKey: ['auth', 'login-history', page],
    queryFn: async () => {
      const { data } = await api.get('/api/auth/login-history', { params: { page } });
      // Normalize: Laravel paginate() returns flat, we need { data, meta }
      if (data.meta) return data;
      return {
        data: data.data,
        meta: {
          current_page: data.current_page,
          last_page: data.last_page,
          per_page: data.per_page,
          total: data.total,
        },
      };
    },
  });
}

export function useRecoveryCodes() {
  return useQuery<string[]>({
    queryKey: ['auth', '2fa', 'recovery-codes'],
    queryFn: async () => {
      const { data } = await api.get<{ codes: string[] }>('/api/auth/2fa/recovery-codes');
      return data.codes;
    },
    enabled: false,
  });
}

export function useRegenerateRecoveryCodes() {
  const qc = useQueryClient();
  return useMutation<{ codes: string[] }, Error>({
    mutationFn: async () => {
      const { data } = await api.post('/api/auth/2fa/recovery-codes/regenerate');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', '2fa', 'recovery-codes'] }),
  });
}

export function useDisable2FA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (password: string) => {
      await api.delete('/api/auth/2fa', { data: { password } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });
}

export function useAutoReply(mailboxId: number | null) {
  return useQuery<AutoReply>({
    queryKey: ['auto-reply', mailboxId],
    queryFn: async () => {
      const { data } = await api.get(`/api/mailboxes/${mailboxId}/auto-reply`);
      return data;
    },
    enabled: mailboxId !== null,
  });
}

export function useUpdateAutoReply(mailboxId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<AutoReply>) => {
      const { data } = await api.put(`/api/mailboxes/${mailboxId}/auto-reply`, payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-reply', mailboxId] }),
  });
}

export function usePreferences() {
  return useQuery<UserPreferences>({
    queryKey: ['auth', 'preferences'],
    queryFn: async () => {
      const { data } = await api.get('/api/auth/preferences');
      return data;
    },
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<UserPreferences>) => {
      const { data } = await api.put('/api/auth/preferences', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'preferences'] }),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (password: string) => {
      await api.post('/api/auth/delete-account', { password });
    },
  });
}

export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.get('/api/auth/export');
      return data;
    },
  });
}

export function useUpdateMailboxProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mailboxId, displayName, avatar }: {
      mailboxId: number;
      displayName?: string | null;
      avatar?: File;
    }) => {
      const formData = new FormData();
      if (displayName !== undefined) {
        formData.append('display_name', displayName ?? '');
      }
      if (avatar) {
        formData.append('avatar', avatar);
      }
      const { data } = await api.post(`/api/mailboxes/${mailboxId}/profile`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailboxes'] });
    },
  });
}
