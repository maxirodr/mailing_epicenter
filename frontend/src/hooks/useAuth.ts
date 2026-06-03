import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { fetchCsrfCookie } from '../services/api';
import type { User, LoginResponse } from '../types';

export function useAuth() {
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    error,
  } = useQuery<User>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const { data } = await api.get<User>('/api/auth/me');
      return data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Only treat 401 as "not authenticated" — a 500 during refetch shouldn't log the user out
  const is401 = !!(error && (error as unknown as { response?: { status?: number } }).response?.status === 401);

  const loginMutation = useMutation<LoginResponse, Error, { email: string; password: string }>({
    mutationFn: async (credentials) => {
      await fetchCsrfCookie();
      const { data } = await api.post<LoginResponse>('/api/auth/login', credentials);
      return data;
    },
    onSuccess: (data) => {
      if (data.user) {
        queryClient.setQueryData(['auth', 'me'], data.user);
      }
    },
  });

  const verify2faMutation = useMutation<{ user: User }, Error, { code: string }>({
    mutationFn: async (payload) => {
      const { data } = await api.post<{ user: User }>('/api/auth/2fa/totp', payload);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data.user);
    },
  });

  const setupCompleteMutation = useMutation<{ user: User }, Error>({
    mutationFn: async () => {
      const { data } = await api.post<{ user: User }>('/api/auth/setup-complete');
      return data;
    },
    onSuccess: (data) => {
      if (data.user) {
        queryClient.setQueryData(['auth', 'me'], data.user);
      }
    },
  });

  const logoutMutation = useMutation<void, Error>({
    mutationFn: async () => {
      await api.post('/api/auth/logout');
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user && !is401,
    login: loginMutation,
    verify2fa: verify2faMutation,
    setupComplete: setupCompleteMutation,
    logout: logoutMutation,
  };
}
