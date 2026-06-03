import OneSignal from 'react-onesignal';

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;

let isInitialized = false;

export function isOneSignalConfigured(): boolean {
  return !!ONESIGNAL_APP_ID;
}

export async function initOneSignal(): Promise<void> {
  if (!ONESIGNAL_APP_ID || isInitialized) return;
  try {
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerPath: '/OneSignalSDKWorker.js',
    });
    isInitialized = true;
  } catch {
    // Already initialized
    isInitialized = true;
  }
}

export async function loginOneSignal(userId: number): Promise<void> {
  if (!isInitialized) return;
  try {
    await OneSignal.login(`user_${userId}`);
  } catch (e) {
    console.warn('OneSignal login failed:', e);
  }
}

export async function logoutOneSignal(): Promise<void> {
  if (!isInitialized) return;
  try {
    await OneSignal.logout();
  } catch (e) {
    console.warn('OneSignal logout failed:', e);
  }
}

export async function requestPermission(): Promise<boolean> {
  if (!isInitialized) return false;
  try {
    await OneSignal.Slidedown.promptPush();
    return OneSignal.Notifications.permission;
  } catch {
    return false;
  }
}

export async function isPushEnabled(): Promise<boolean> {
  if (!isInitialized) return false;
  try {
    return OneSignal.Notifications.permission && (OneSignal.User?.PushSubscription?.optedIn ?? false);
  } catch {
    return false;
  }
}

export async function getSubscriptionId(): Promise<string | null> {
  if (!isInitialized) return null;
  try {
    return OneSignal.User?.PushSubscription?.id || null;
  } catch {
    return null;
  }
}

export async function setOptIn(optIn: boolean): Promise<void> {
  if (!isInitialized) return;
  try {
    if (optIn) {
      await OneSignal.User?.PushSubscription?.optIn();
    } else {
      await OneSignal.User?.PushSubscription?.optOut();
    }
  } catch (e) {
    console.warn('OneSignal opt in/out failed:', e);
  }
}
