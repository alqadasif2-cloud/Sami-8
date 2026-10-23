/**
 * Push Notifications & Session Synchronization Bridge (Web & Android Native)
 */

declare global {
  interface Window {
    AndroidBridge?: {
      syncUserSession?: (userId: number, displayName: string) => void;
      unregisterFcmToken?: (userId: number) => void;
    };
    AndroidApp?: {
      syncUserSession?: (userId: number, displayName: string) => void;
      unregisterFcmToken?: (userId: number) => void;
    };
  }
}

export function syncUserSessionToNative(userId: number, displayName: string): void {
  try {
    if (typeof window !== 'undefined') {
      if (window.AndroidBridge?.syncUserSession) {
        window.AndroidBridge.syncUserSession(userId, displayName);
      } else if (window.AndroidApp?.syncUserSession) {
        window.AndroidApp.syncUserSession(userId, displayName);
      }
    }
  } catch (err) {
    console.warn('[Sami FCM] Error syncing session to native bridge:', err);
  }
}

export async function unregisterUserFcmToken(userId: number): Promise<void> {
  try {
    if (typeof window !== 'undefined') {
      if (window.AndroidBridge?.unregisterFcmToken) {
        window.AndroidBridge.unregisterFcmToken(userId);
      } else if (window.AndroidApp?.unregisterFcmToken) {
        window.AndroidApp.unregisterFcmToken(userId);
      }
    }
  } catch (err) {
    console.warn('[Sami FCM] Error unregistering FCM token:', err);
  }
}

export async function requestPushNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch {
    return false;
  }
}
