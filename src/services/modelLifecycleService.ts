import { unloadEngine, getEngine } from './webllmService';
import { Settings } from '../types';

let suspendTimeout: any = null;
const SUSPEND_DELAY = 5 * 60 * 1000; // 5 minutes of inactivity

export function initLifecycleManager(settings: Settings, onSuspend: () => void) {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      if (settings.suspendOnHide) {
        console.log('[Lifecycle] Tab hidden, suspending model immediately');
        unloadEngine().then(onSuspend);
      } else if (settings.autoSuspend) {
        console.log('[Lifecycle] Tab hidden, starting suspend timeout');
        startSuspendTimer(onSuspend);
      }
    } else {
      console.log('[Lifecycle] Tab visible, clearing suspend timeout');
      clearSuspendTimer();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Keep alive logic
  if (settings.keepAlive) {
    // Attempt to prevent browser from killing the tab too aggressively
    // This is a hint, not a guarantee
    try {
      if ('wakeLock' in navigator) {
        (navigator as any).wakeLock.request('screen').catch(() => {});
      }
    } catch (e) {}
  }

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    clearSuspendTimer();
  };
}

export function startSuspendTimer(onSuspend: () => void) {
  clearSuspendTimer();
  if (getEngine()) {
    suspendTimeout = setTimeout(async () => {
      console.log('[Lifecycle] Inactivity timeout reached, suspending model');
      await unloadEngine();
      onSuspend();
    }, SUSPEND_DELAY);
  }
}

export function clearSuspendTimer() {
  if (suspendTimeout) {
    clearTimeout(suspendTimeout);
    suspendTimeout = null;
  }
}
