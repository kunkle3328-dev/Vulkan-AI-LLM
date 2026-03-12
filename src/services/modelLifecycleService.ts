import { unloadEngine, getRuntimeState, switchModel } from './webllmService';
import { Settings, ModelStatus } from '../types';

type LifecycleState = 'idle' | 'installing' | 'verifying' | 'booting' | 'ready' | 'suspended' | 'error';

let currentState: LifecycleState = 'idle';
let listeners: ((state: LifecycleState) => void)[] = [];

export function subscribe(listener: (state: LifecycleState) => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

function setState(state: LifecycleState) {
  currentState = state;
  listeners.forEach(l => l(state));
}

export async function transition(action: 'install' | 'verify' | 'boot' | 'ready' | 'suspend' | 'resume' | 'unload' | 'repair' | 'delete', modelId?: string) {
  switch (action) {
    case 'boot':
      if (modelId) {
        setState('booting');
        try {
          await switchModel(modelId);
          setState('ready');
        } catch (e) {
          setState('error');
        }
      }
      break;
    case 'unload':
      await unloadEngine();
      setState('idle');
      break;
    // ... other transitions
  }
}

// ... existing suspend logic ...
let suspendTimeout: any = null;
const SUSPEND_DELAY = 5 * 60 * 1000;

export function initLifecycleManager(settings: Settings, onSuspend: () => void) {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      if (settings.suspendOnHide) {
        console.log('[Lifecycle] Tab hidden, suspending model immediately');
        transition('unload').then(onSuspend);
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

  if (settings.keepAlive) {
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
  if (getRuntimeState() !== 'idle') {
    suspendTimeout = setTimeout(async () => {
      console.log('[Lifecycle] Inactivity timeout reached, suspending model');
      await transition('unload');
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
