import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { COLORS, RADII, SHADOWS, SPACING } from '../theme/tokens';
import { getStorageItem, removeStorageItem, setStorageItem } from '../utils/storage';

export const PIN_HASH_STORAGE_KEY = 'duasaku_pin_hash';
export const PIN_ENABLED_STORAGE_KEY = 'duasaku_pin_enabled';

const PIN_RE = /^\d{4}$/;
const PIN_HASH_SALT = 'duasaku-pin-lock-v1:';

interface AppLockStoreState {
  pinEnabled: boolean;
  hasPin: boolean;
  isLocked: boolean;
}

export interface PinActionResult {
  ok: boolean;
  error?: string;
}

export interface AppLockSettings {
  pinEnabled: boolean;
  hasPin: boolean;
  isLocked: boolean;
  setPin: (newPin: string) => PinActionResult;
  changePin: (currentPin: string, newPin: string) => PinActionResult;
  disablePin: (currentPin?: string) => PinActionResult;
  verifyPin: (pin: string) => boolean;
  unlockWithPin: (pin: string) => boolean;
  lockApp: () => void;
  refreshFromStorage: () => void;
}

export interface AppLockGateProps {
  children: React.ReactNode;
  /** Optional subtitle displayed below the lock title */
  subtitle?: string;
  /** Optional handler if user forgot PIN and chooses to re-authenticate */
  onForgotPin?: () => void;
}

// Pure-JS SHA-256 (synchronous across Web, iOS, and Android Hermes without crypto.subtle)
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256Hex(input: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length + 8) % 64 !== 0) {
    bytes.push(0);
  }
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  bytes.push(
    (hi >>> 24) & 0xff,
    (hi >>> 16) & 0xff,
    (hi >>> 8) & 0xff,
    hi & 0xff,
    (lo >>> 24) & 0xff,
    (lo >>> 16) & 0xff,
    (lo >>> 8) & 0xff,
    lo & 0xff
  );

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Array<number>(64).fill(0);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4;
      w[i] =
        ((bytes[idx] << 24) |
          (bytes[idx + 1] << 16) |
          (bytes[idx + 2] << 8) |
          bytes[idx + 3]) >>>
        0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((val) => val.toString(16).padStart(8, '0'))
    .join('');
}

function hashPin(pin: string): string {
  return `ds1:${sha256Hex(`${PIN_HASH_SALT}${pin}`)}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function readPersistedLockConfig(): { pinEnabled: boolean; hasPin: boolean } {
  const rawEnabled = getStorageItem(PIN_ENABLED_STORAGE_KEY);
  const rawHash = getStorageItem(PIN_HASH_STORAGE_KEY);
  const hasPin = typeof rawHash === 'string' && rawHash.trim().length > 0;
  const pinEnabled = rawEnabled === 'true' && hasPin;
  return { pinEnabled, hasPin };
}

let storeState: AppLockStoreState | null = null;
const listeners = new Set<() => void>();

function ensureStoreState(): AppLockStoreState {
  if (storeState === null) {
    const { pinEnabled, hasPin } = readPersistedLockConfig();
    storeState = {
      pinEnabled,
      hasPin,
      isLocked: pinEnabled && hasPin,
    };
  }
  return storeState;
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function updateStoreState(next: AppLockStoreState): void {
  storeState = next;
  notifyListeners();
}

function verifyPinValue(pin: string): boolean {
  if (!PIN_RE.test(pin)) return false;
  const storedHash = getStorageItem(PIN_HASH_STORAGE_KEY);
  if (!storedHash) return false;
  return constantTimeEqual(hashPin(pin), storedHash);
}

function setPinAction(newPin: string): PinActionResult {
  if (!PIN_RE.test(newPin)) {
    return { ok: false, error: 'PIN harus terdiri dari 4 digit angka.' };
  }
  setStorageItem(PIN_HASH_STORAGE_KEY, hashPin(newPin));
  setStorageItem(PIN_ENABLED_STORAGE_KEY, 'true');
  updateStoreState({
    pinEnabled: true,
    hasPin: true,
    isLocked: false,
  });
  return { ok: true };
}

function changePinAction(currentPin: string, newPin: string): PinActionResult {
  const { hasPin } = readPersistedLockConfig();
  if (hasPin && !verifyPinValue(currentPin)) {
    return { ok: false, error: 'PIN saat ini tidak sesuai.' };
  }
  if (!PIN_RE.test(newPin)) {
    return { ok: false, error: 'PIN baru harus terdiri dari 4 digit angka.' };
  }
  setStorageItem(PIN_HASH_STORAGE_KEY, hashPin(newPin));
  setStorageItem(PIN_ENABLED_STORAGE_KEY, 'true');
  updateStoreState({
    pinEnabled: true,
    hasPin: true,
    isLocked: false,
  });
  return { ok: true };
}

function disablePinAction(currentPin?: string): PinActionResult {
  const { hasPin } = readPersistedLockConfig();
  if (currentPin !== undefined && hasPin && !verifyPinValue(currentPin)) {
    return { ok: false, error: 'PIN tidak sesuai. Kunci gagal dinonaktifkan.' };
  }
  removeStorageItem(PIN_HASH_STORAGE_KEY);
  setStorageItem(PIN_ENABLED_STORAGE_KEY, 'false');
  updateStoreState({
    pinEnabled: false,
    hasPin: false,
    isLocked: false,
  });
  return { ok: true };
}

function unlockWithPinAction(pin: string): boolean {
  const current = ensureStoreState();
  if (!current.pinEnabled || !current.hasPin) {
    if (current.isLocked) {
      updateStoreState({ ...current, isLocked: false });
    }
    return true;
  }
  if (!verifyPinValue(pin)) {
    return false;
  }
  updateStoreState({
    ...current,
    isLocked: false,
  });
  return true;
}

function lockAppAction(): void {
  const { pinEnabled, hasPin } = readPersistedLockConfig();
  if (pinEnabled && hasPin) {
    updateStoreState({
      pinEnabled: true,
      hasPin: true,
      isLocked: true,
    });
  }
}

function refreshFromStorageAction(): void {
  const { pinEnabled, hasPin } = readPersistedLockConfig();
  updateStoreState({
    pinEnabled,
    hasPin,
    isLocked: pinEnabled && hasPin,
  });
}

/**
 * Shared hook to inspect and manage DuaSaku 4-digit PIN lock settings.
 * Default state is disabled so onboarding and E2E flows remain unaffected unless enabled.
 */
export function useAppLockSettings(): AppLockSettings {
  const [snapshot, setSnapshot] = useState<AppLockStoreState>(() => ensureStoreState());

  useEffect(() => {
    const sync = () => {
      setSnapshot(ensureStoreState());
    };
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  return {
    pinEnabled: snapshot.pinEnabled,
    hasPin: snapshot.hasPin,
    isLocked: snapshot.isLocked,
    setPin: setPinAction,
    changePin: changePinAction,
    disablePin: disablePinAction,
    verifyPin: verifyPinValue,
    unlockWithPin: unlockWithPinAction,
    lockApp: lockAppAction,
    refreshFromStorage: refreshFromStorageAction,
  };
}

const LOCK_KEYPAD_ROWS: ReadonlyArray<ReadonlyArray<string>> = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['C', '0', '⌫'],
];

/**
 * Wraps the app root and blocks access behind a 20:9-friendly 4-digit PIN keypad
 * whenever PIN lock is enabled and the session is currently locked.
 */
export function AppLockGate({
  children,
  subtitle = 'Masukkan 4 digit PIN untuk membuka ruang keuangan pasangan.',
  onForgotPin,
}: AppLockGateProps): React.JSX.Element {
  const { pinEnabled, hasPin, isLocked, unlockWithPin, lockApp } = useAppLockSettings();
  const { width, height } = useWindowDimensions();

  const [enteredPin, setEnteredPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const appStateRef = useRef(AppState.currentState);

  const shouldLockView = pinEnabled && hasPin && isLocked;

  // Lock automatically when native app returns from background while PIN is enabled
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      if (
        Platform.OS !== 'web' &&
        pinEnabled &&
        hasPin &&
        prevState === 'active' &&
        nextState === 'background'
      ) {
        lockApp();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [pinEnabled, hasPin, lockApp]);

  useEffect(() => {
    if (!shouldLockView) {
      setEnteredPin('');
      setErrorMsg(null);
      setFailedAttempts(0);
    }
  }, [shouldLockView]);

  const handleDigitPress = (digit: string) => {
    if (enteredPin.length >= 4) return;
    const nextPin = `${enteredPin}${digit}`;
    setErrorMsg(null);
    setEnteredPin(nextPin);

    if (nextPin.length === 4) {
      const unlocked = unlockWithPin(nextPin);
      if (unlocked) {
        setEnteredPin('');
        setErrorMsg(null);
        setFailedAttempts(0);
      } else {
        setEnteredPin('');
        setFailedAttempts((prev) => prev + 1);
        setErrorMsg('PIN salah. Silakan coba lagi.');
      }
    }
  };

  const handleKeyPress = (key: string) => {
    if (key === 'C') {
      setEnteredPin('');
      setErrorMsg(null);
      return;
    }
    if (key === '⌫') {
      setEnteredPin((prev) => prev.slice(0, -1));
      setErrorMsg(null);
      return;
    }
    handleDigitPress(key);
  };

  if (!shouldLockView) {
    return <>{children}</>;
  }

  const isWide = width > 452;

  return (
    <View style={styles.root}>
      <View
        style={styles.hiddenChildren}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {children}
      </View>

      <View
        style={[
          styles.overlay,
          { backgroundColor: isWide ? COLORS.bgOuter : COLORS.bgCream },
          Platform.OS === 'web' ? { minHeight: height } : undefined,
        ]}
        testID="app-lock-overlay"
      >
        <View
          style={[
            styles.frameColumn,
            isWide && styles.frameColumnWide,
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header Emblem */}
            <View style={styles.headerBlock}>
              <View style={styles.lockBadge}>
                <Text style={styles.lockBadgeIcon}>🔒</Text>
              </View>
              <Text style={styles.title} testID="app-lock-title">
                DuaSaku Terkunci
              </Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            {/* 4-Digit PIN Dots */}
            <View style={styles.dotsRow} testID="app-lock-dots">
              {[0, 1, 2, 3].map((idx) => {
                const filled = idx < enteredPin.length;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.dot,
                      filled && styles.dotFilled,
                      Boolean(errorMsg) && !filled && styles.dotError,
                    ]}
                    testID={`app-lock-dot-${idx}`}
                  />
                );
              })}
            </View>

            {/* Fixed-Height Error Slot (prevents vertical layout shift on 20:9 frames) */}
            <View style={styles.feedbackSlot}>
              {errorMsg ? (
                <Text style={styles.errorText} testID="app-lock-error">
                  {errorMsg}
                </Text>
              ) : (
                <Text style={styles.helperText}>Masukkan 4 angka PIN Anda</Text>
              )}
            </View>

            {/* 3x4 Numeric Keypad */}
            <View style={styles.keypad}>
              {LOCK_KEYPAD_ROWS.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.keypadRow}>
                  {row.map((keyLabel) => {
                    const isUtility = keyLabel === 'C' || keyLabel === '⌫';
                    const testSuffix =
                      keyLabel === 'C' ? 'clear' : keyLabel === '⌫' ? 'backspace' : keyLabel;
                    const a11yLabel =
                      keyLabel === 'C'
                        ? 'Bersihkan PIN'
                        : keyLabel === '⌫'
                          ? 'Hapus satu angka'
                          : `Angka ${keyLabel}`;

                    return (
                      <TouchableOpacity
                        key={keyLabel}
                        style={[styles.keyBtn, isUtility && styles.keyBtnUtility]}
                        onPress={() => handleKeyPress(keyLabel)}
                        accessibilityRole="button"
                        accessibilityLabel={a11yLabel}
                        testID={`app-lock-key-${testSuffix}`}
                      >
                        <Text style={[styles.keyText, isUtility && styles.keyTextUtility]}>
                          {keyLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            {onForgotPin && failedAttempts >= 1 && (
              <TouchableOpacity
                style={styles.forgotBtn}
                onPress={onForgotPin}
                accessibilityRole="button"
                testID="app-lock-forgot-btn"
              >
                <Text style={styles.forgotBtnText}>Lupa PIN? Keluar & Masuk Ulang</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  hiddenChildren: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameColumn: {
    flex: 1,
    width: '100%',
    backgroundColor: COLORS.bgCream,
  },
  frameColumnWide: {
    maxWidth: 420,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.borderStrong,
    ...SHADOWS.hero,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxl,
    gap: SPACING.lg,
  },
  headerBlock: {
    alignItems: 'center',
    gap: SPACING.sm,
    maxWidth: 320,
  },
  lockBadge: {
    width: 60,
    height: 60,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.heroCocoa,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.borderStrong,
    marginBottom: SPACING.xs,
    ...SHADOWS.card,
  },
  lockBadgeIcon: {
    fontSize: 26,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.warmSand,
    borderWidth: 2,
    borderColor: COLORS.borderStrong,
  },
  dotFilled: {
    backgroundColor: COLORS.terracottaBtn,
    borderColor: COLORS.terracottaBtn,
  },
  dotError: {
    borderColor: COLORS.terracottaDark,
    backgroundColor: COLORS.terracottaSoft,
  },
  feedbackSlot: {
    minHeight: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.terracottaDark,
    textAlign: 'center',
  },
  helperText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  keypad: {
    width: '100%',
    maxWidth: 300,
    gap: SPACING.sm + 2,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: SPACING.sm + 2,
  },
  keyBtn: {
    flex: 1,
    minHeight: 54,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  keyBtnUtility: {
    backgroundColor: COLORS.warmSand,
    borderColor: COLORS.borderStrong,
  },
  keyText: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  keyTextUtility: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  forgotBtn: {
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    backgroundColor: COLORS.terracottaSoft,
    borderWidth: 1,
    borderColor: COLORS.terracotta,
  },
  forgotBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
});
