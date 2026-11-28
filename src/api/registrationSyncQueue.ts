import type { AppStateStatus } from 'react-native';
import { getStorageItem, setStorageItem } from '../utils/storage';
import { sharedApi } from './client';

// Safe runtime resolution for React Native primitives to allow headless / Node test execution
function getReactNativeModule(): { AppState: any; Platform: any } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    return { AppState: rn.AppState, Platform: rn.Platform };
  } catch {
    return {
      AppState: null,
      Platform: { OS: typeof window !== 'undefined' ? 'web' : 'node' },
    };
  }
}

export const REGISTRATION_SYNC_QUEUE_KEY = 'duasaku_registration_sync_queue_v1';

export interface PendingRegistrationSync {
  id: string;
  email: string;
  name: string;
  password?: string;
  otpCode?: string;
  appSlug: string;
  createdAt: number;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
}

export interface DrainResult {
  drained: number;
  failed: number;
  remaining: number;
  errors: string[];
}

export const BASE_RETRY_DELAY_MS = 3000; // 3 seconds
export const MAX_RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes max
export const MAX_ATTEMPTS = 20;

let isDraining = false;
let syncWorkerTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

type TokenListener = (token: string) => void;
const tokenListeners = new Set<TokenListener>();

export function subscribeSharedToken(listener: TokenListener): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

function notifySharedToken(token: string): void {
  for (const listener of tokenListeners) {
    try {
      listener(token);
    } catch {
      // ignore listener errors
    }
  }
}

export function calculateBackoff(attempts: number, baseMs = BASE_RETRY_DELAY_MS): number {
  const exp = Math.min(6, Math.max(0, attempts));
  const delay = baseMs * Math.pow(2.5, exp);
  const jitter = Math.random() * 500;
  return Math.min(MAX_RETRY_DELAY_MS, Math.round(delay + jitter));
}

export function getRegistrationSyncQueue(): PendingRegistrationSync[] {
  try {
    const raw = getStorageItem(REGISTRATION_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PendingRegistrationSync =>
        Boolean(item && typeof item === 'object' && typeof (item as any).email === 'string')
    );
  } catch {
    return [];
  }
}

export function saveRegistrationSyncQueue(queue: PendingRegistrationSync[]): void {
  try {
    setStorageItem(REGISTRATION_SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore storage write errors
  }
}

export function clearRegistrationSyncQueue(): void {
  saveRegistrationSyncQueue([]);
}

export async function enqueueRegistrationSync(item: {
  email: string;
  name: string;
  password?: string;
  otpCode?: string;
}): Promise<PendingRegistrationSync> {
  const cleanEmail = item.email.trim().toLowerCase();
  const queue = getRegistrationSyncQueue();
  const existingIdx = queue.findIndex((q) => q.email.toLowerCase() === cleanEmail);

  const entry: PendingRegistrationSync = {
    id: `sync_${cleanEmail}_${Date.now()}`,
    email: cleanEmail,
    name: item.name.trim(),
    password: item.password,
    otpCode: item.otpCode?.trim(),
    appSlug: 'duasaku',
    createdAt: Date.now(),
    attempts: 0,
    nextRetryAt: Date.now(),
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = {
      ...queue[existingIdx],
      ...entry,
      attempts: queue[existingIdx].attempts,
    };
  } else {
    queue.push(entry);
  }

  saveRegistrationSyncQueue(queue);
  return entry;
}

export async function drainRegistrationSyncQueue(options?: {
  force?: boolean;
}): Promise<DrainResult> {
  if (isDraining) {
    const currentQueue = getRegistrationSyncQueue();
    return { drained: 0, failed: 0, remaining: currentQueue.length, errors: [] };
  }

  isDraining = true;
  const now = Date.now();
  const queue = getRegistrationSyncQueue();
  const remainingQueue: PendingRegistrationSync[] = [];
  const errors: string[] = [];
  let drainedCount = 0;
  let failedCount = 0;

  try {
    for (const item of queue) {
      if (!options?.force && item.nextRetryAt > now) {
        remainingQueue.push(item);
        continue;
      }

      let success = false;
      let syncError = '';

      // 1. First try full register if password and otpCode exist
      if (item.password && item.otpCode) {
        try {
          const res = await sharedApi.register({
            email: item.email,
            password: item.password,
            name: item.name,
            otpCode: item.otpCode,
          });
          if (res?.token) {
            notifySharedToken(res.token);
          }
          success = true;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('Email sudah terdaftar') || msg.includes('409')) {
            // Already registered on shared backend; user exists
            success = true;
          } else {
            syncError = msg;
          }
        }
      }

      // 2. Fallback to idempotent /api/users/sync if register failed or OTP missing/expired
      if (!success) {
        try {
          const res = await sharedApi.syncUser({
            email: item.email,
            name: item.name,
            appSlug: 'duasaku',
          });
          if (res?.ok) {
            success = true;
            syncError = '';
          }
        } catch (err: unknown) {
          syncError = err instanceof Error ? err.message : String(err || 'Sync failed');
        }
      }

      if (success) {
        drainedCount++;
      } else {
        failedCount++;
        const nextAttempts = item.attempts + 1;
        errors.push(`${item.email}: ${syncError}`);

        if (nextAttempts <= MAX_ATTEMPTS) {
          remainingQueue.push({
            ...item,
            attempts: nextAttempts,
            nextRetryAt: Date.now() + calculateBackoff(nextAttempts),
            lastError: syncError,
          });
        }
      }
    }

    saveRegistrationSyncQueue(remainingQueue);
  } finally {
    isDraining = false;
  }

  return {
    drained: drainedCount,
    failed: failedCount,
    remaining: remainingQueue.length,
    errors,
  };
}

export function startRegistrationSyncWorker(intervalMs = 30000): () => void {
  // 1. Initial drain attempt
  drainRegistrationSyncQueue().catch(() => {});

  // 2. Interval polling for pending retries
  if (syncWorkerTimer) clearInterval(syncWorkerTimer);
  syncWorkerTimer = setInterval(() => {
    const queue = getRegistrationSyncQueue();
    if (queue.length > 0) {
      drainRegistrationSyncQueue().catch(() => {});
    }
  }, intervalMs);

  const { AppState, Platform } = getReactNativeModule();

  // 3. React Native AppState listener (drain whenever app returns to foreground)
  if (!appStateSubscription && AppState && typeof AppState.addEventListener === 'function') {
    try {
      appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          drainRegistrationSyncQueue().catch(() => {});
        }
      });
    } catch {
      // ignore
    }
  }

  // 4. Web online event listener
  if (Platform?.OS === 'web' && typeof window !== 'undefined' && window.addEventListener) {
    try {
      window.addEventListener('online', () => {
        drainRegistrationSyncQueue({ force: true }).catch(() => {});
      });
    } catch {
      // ignore
    }
  }

  return stopRegistrationSyncWorker;
}

export function stopRegistrationSyncWorker(): void {
  if (syncWorkerTimer) {
    clearInterval(syncWorkerTimer);
    syncWorkerTimer = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}
