import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import type { CoupleSpace, PartnerProfile } from '../types';

export const TOKEN_STORAGE_KEY = 'duasaku_auth_token';
export const SESSION_STORAGE_KEY = 'duasaku_session_v1';
export const MONTH_STORAGE_KEY = 'duasaku_selected_month';

const NATIVE_STORE_FILENAME = 'duasaku_kv_store.json';

export interface StoredSession {
  token: string;
  partner: PartnerProfile;
  couple?: CoupleSpace;
}

const memoryStore = new Map<string, string>();
let nativeHydrated = false;

function getWebStorage(): Storage | null {
  try {
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined'
    ) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function getNativeStoreFile(): File | null {
  if (Platform.OS === 'web') return null;
  try {
    return new File(Paths.document, NATIVE_STORE_FILENAME);
  } catch {
    return null;
  }
}

function ensureNativeLoaded(): void {
  if (nativeHydrated || Platform.OS === 'web') return;
  nativeHydrated = true;
  const file = getNativeStoreFile();
  if (!file) return;
  try {
    if (!file.exists) return;
    const raw = file.textSync();
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && !memoryStore.has(k)) {
        memoryStore.set(k, v);
      }
    }
  } catch {
    // Fall back to in-memory store
  }
}

function persistNativeStore(): void {
  if (Platform.OS === 'web') return;
  const file = getNativeStoreFile();
  if (!file) return;
  try {
    if (memoryStore.size === 0) {
      if (file.exists) {
        file.delete();
      }
      return;
    }
    if (!file.exists) {
      file.create({ intermediates: true, overwrite: true });
    }
    const payload: Record<string, string> = {};
    for (const [k, v] of memoryStore.entries()) {
      payload[k] = v;
    }
    file.writeSync(JSON.stringify(payload));
  } catch {
    // Fall back to in-memory store
  }
}

export function getStorageItem(key: string): string | null {
  const ls = getWebStorage();
  if (ls) {
    try {
      const val = ls.getItem(key);
      if (val !== null) {
        memoryStore.set(key, val);
        return val;
      }
    } catch {
      // Fall back to in-memory store
    }
  }
  ensureNativeLoaded();
  return memoryStore.get(key) ?? null;
}

export function setStorageItem(key: string, value: string): void {
  ensureNativeLoaded();
  memoryStore.set(key, value);
  const ls = getWebStorage();
  if (ls) {
    try {
      ls.setItem(key, value);
    } catch {
      // Ignore QuotaExceededError / SecurityError
    }
    return;
  }
  persistNativeStore();
}

export function removeStorageItem(key: string): void {
  ensureNativeLoaded();
  memoryStore.delete(key);
  const ls = getWebStorage();
  if (ls) {
    try {
      ls.removeItem(key);
    } catch {
      // Ignore SecurityError
    }
    return;
  }
  persistNativeStore();
}

export function getStoredToken(): string | null {
  return getStorageItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string): void {
  setStorageItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  removeStorageItem(TOKEN_STORAGE_KEY);
}

function isValidStoredCouple(val: unknown): val is CoupleSpace {
  if (!val || typeof val !== 'object') return false;
  const c = val as Partial<CoupleSpace>;
  return (
    typeof c.id === 'string' &&
    typeof c.coupleName === 'string' &&
    typeof c.inviteCode === 'string' &&
    Array.isArray(c.partners)
  );
}

export function loadSession(): StoredSession | null {
  const raw = getStorageItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.token === 'string' &&
      parsed.token.length > 0 &&
      parsed.partner &&
      typeof parsed.partner.id === 'string' &&
      typeof parsed.partner.coupleId === 'string' &&
      typeof parsed.partner.name === 'string'
    ) {
      return {
        token: parsed.token,
        partner: parsed.partner,
        ...(isValidStoredCouple(parsed.couple) ? { couple: parsed.couple } : {}),
      };
    }
  } catch {
    // Malformed session payload
  }
  return null;
}

export function saveSession(
  token: string,
  partner: PartnerProfile,
  couple?: CoupleSpace | null
): void {
  setStoredToken(token);
  const payload: StoredSession = couple ? { token, partner, couple } : { token, partner };
  setStorageItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
}

export function clearSession(): void {
  clearStoredToken();
  removeStorageItem(SESSION_STORAGE_KEY);
}
