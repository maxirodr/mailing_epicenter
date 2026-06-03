import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import type { AdminUser, AdminMailbox, PaginatedResponse } from '../types';

// ── Users ────────────────────────────────────────────────────────────

export function useAdminUsers(page = 1, search = '') {
  return useQuery<PaginatedResponse<AdminUser>>({
    queryKey: ['admin', 'users', page, search],
    queryFn: async () => {
      const params: Record<string, string | number> = { page };
      if (search) params.search = search;
      const { data } = await api.get<PaginatedResponse<AdminUser>>('/api/admin/users', { params });
      return data;
    },
    staleTime: 30_000,
  });
}

export function useAdminCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; email: string; password?: string; is_admin: boolean; create_mailbox?: boolean; send_invite?: boolean }) => {
      const { data } = await api.post<AdminUser & { invite_url?: string }>('/api/admin/users', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useAdminUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: number; name?: string; email?: string; password?: string; is_admin?: boolean }) => {
      const { data } = await api.put<AdminUser>(`/api/admin/users/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useAdminDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/admin/users/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

// ── Mailboxes ────────────────────────────────────────────────────────

export function useAdminMailboxes(page = 1, search = '') {
  return useQuery<PaginatedResponse<AdminMailbox>>({
    queryKey: ['admin', 'mailboxes', page, search],
    queryFn: async () => {
      const params: Record<string, string | number> = { page };
      if (search) params.search = search;
      const { data } = await api.get<PaginatedResponse<AdminMailbox>>('/api/admin/mailboxes', { params });
      return data;
    },
    staleTime: 30_000,
  });
}

export function useAdminCreateMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { address: string; domain: string; display_name?: string }) => {
      const { data } = await api.post<AdminMailbox>('/api/admin/mailboxes', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'mailboxes'] });
    },
  });
}

export function useAdminUpdateMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: number; address?: string; domain?: string; display_name?: string }) => {
      const { data } = await api.put<AdminMailbox>(`/api/admin/mailboxes/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'mailboxes'] });
    },
  });
}

export function useAdminDeleteMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/admin/mailboxes/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'mailboxes'] });
    },
  });
}

export function useAdminAssignUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mailboxId, userId, role }: { mailboxId: number; userId: number; role: 'owner' | 'member' }) => {
      await api.post(`/api/admin/mailboxes/${mailboxId}/users/${userId}`, { role });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'mailboxes'] });
    },
  });
}

export function useAdminRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mailboxId, userId }: { mailboxId: number; userId: number }) => {
      await api.delete(`/api/admin/mailboxes/${mailboxId}/users/${userId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'mailboxes'] });
    },
  });
}

export function useAdminResendInvite() {
  return useMutation({
    mutationFn: async (userId: number) => {
      const { data } = await api.post<{ invite_url: string; expires_at: string }>(`/api/admin/users/${userId}/resend-invite`);
      return data;
    },
  });
}
