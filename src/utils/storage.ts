import { Platform } from 'react-native';
import type { PartnerProfile } from '../types';

export const TOKEN_STORAGE_KEY = 'duasaku_auth_token';
export const SESSION_STORAGE_KEY = 'duasaku_session_v1';
export const MONTH_STORAGE_KEY = 'duasaku_selected_month';

export interface StoredSession {
  token: string;
  partner: PartnerProfile;
}

const memoryStore = new Map<string, string>();

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
  return memoryStore.get(key) ?? null;
}

export function setStorageItem(key: string, value: string): void {
  memoryStore.set(key, value);
  const ls = getWebStorage();
  if (ls) {
    try {
      ls.setItem(key, value);
    } catch {
      // Ignore QuotaExceededError / SecurityError
    }
  }
}

export function removeStorageItem(key: string): void {
  memoryStore.delete(key);
  const ls = getWebStorage();
  if (ls) {
    try {
      ls.removeItem(key);
    } catch {
      // Ignore SecurityError
    }
  }
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
      };
    }
  } catch {
    // Malformed session payload
  }
  return null;
}

export function saveSession(token: string, partner: PartnerProfile): void {
  setStoredToken(token);
  setStorageItem(SESSION_STORAGE_KEY, JSON.stringify({ token, partner }));
}

export function clearSession(): void {
  clearStoredToken();
  removeStorageItem(SESSION_STORAGE_KEY);
}
