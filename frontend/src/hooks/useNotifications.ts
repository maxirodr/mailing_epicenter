import { useState, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../services/api';
import {
  isOneSignalConfigured,
  initOneSignal,
  requestPermission,
  isPushEnabled,
  getSubscriptionId,
  setOptIn,
} from '../services/onesignal';

interface NotificationState {
  isConfigured: boolean;
  isInitialized: boolean;
  isEnabled: boolean;
  subscriptionId: string | null;
}

export function useNotifications(userId: number | null) {
  const [state, setState] = useState<NotificationState>({
    isConfigured: isOneSignalConfigured(),
    isInitialized: false,
    isEnabled: false,
    subscriptionId: null,
  });

  const syncMutation = useMutation({
    mutationFn: async (playerId: string | null) => {
      await api.put('/api/auth/notifications', { onesignal_player_id: playerId });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ message: string; success: boolean }>('/api/admin/test-notification');
      return data;
    },
  });

  const initialize = useCallback(async () => {
    if (!isOneSignalConfigured()) return;
    await initOneSignal();

    const enabled = await isPushEnabled();
    const subId = await getSubscriptionId();
    setState((prev) => ({ ...prev, isInitialized: true, isEnabled: enabled, subscriptionId: subId }));
    if (subId) syncMutation.mutate(subId);
  }, [userId]);

  useEffect(() => { initialize(); }, [initialize]);

  const togglePush = useCallback(async () => {
    if (!state.isInitialized) return;
    if (!state.isEnabled) {
      const granted = await requestPermission();
      if (granted) {
        await setOptIn(true);
        const subId = await getSubscriptionId();
        setState((prev) => ({ ...prev, isEnabled: true, subscriptionId: subId }));
        if (subId) syncMutation.mutate(subId);
      }
    } else {
      await setOptIn(false);
      setState((prev) => ({ ...prev, isEnabled: false, subscriptionId: null }));
      syncMutation.mutate(null);
    }
  }, [state.isInitialized, state.isEnabled]);

  const sendTest = useCallback(() => testMutation.mutateAsync(), [testMutation]);

  return {
    ...state,
    togglePush,
    sendTest,
    isSyncing: syncMutation.isPending,
    isTesting: testMutation.isPending,
  };
}
