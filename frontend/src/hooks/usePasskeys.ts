import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { fetchCsrfCookie } from '../services/api';
import type { User } from '../types';

export interface PasskeyItem {
  id: number;
  name: string;
  created_at: string;
}

export function usePasskeys() {
  return useQuery<PasskeyItem[]>({
    queryKey: ['passkeys'],
    queryFn: async () => {
      const { data } = await api.get<PasskeyItem[]>('/api/auth/passkeys');
      return data;
    },
  });
}

export function useRegisterPasskeyOptions() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/api/auth/passkey/register/options');
      return data;
    },
  });
}

export function useRegisterPasskeyVerify() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (credential: Record<string, unknown>) => {
      const { data } = await api.post('/api/auth/passkey/register/verify', credential);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['passkeys'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useDeletePasskey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete(`/api/auth/passkeys/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['passkeys'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function usePasskeyLoginOptions() {
  return useMutation({
    mutationFn: async () => {
      await fetchCsrfCookie();
      const { data } = await api.post('/api/auth/passkey/login/options');
      return data;
    },
  });
}

export function usePasskeyLoginVerify() {
  const queryClient = useQueryClient();
  return useMutation<{ user: User }, Error, Record<string, unknown>>({
    mutationFn: async (credential) => {
      const { data } = await api.post<{ user: User }>('/api/auth/passkey/login/verify', credential);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data.user);
    },
  });
}
