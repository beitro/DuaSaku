import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppFrame } from '../components/AppFrame';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { useDuaSaku } from '../context/DuaSakuContext';
import { COLORS, RADII, SHADOWS, SPACING } from '../theme/tokens';

type AuthTab = 'login' | 'register' | 'create' | 'join';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OnboardingScreen(): React.JSX.Element {
  const {
    loginAccount,
    registerAccount,
    createCouple,
    joinCouple,
    loading,
    feedback,
    clearFeedback,
  } = useDuaSaku();

  const [authMode, setAuthMode] = useState<AuthTab>('create');
  const [registerScope, setRegisterScope] = useState<'create' | 'join'>('create');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [coupleNameInput, setCoupleNameInput] = useState('Dompet Masa Depan');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [partnerNameInput, setPartnerNameInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const switchMode = (mode: AuthTab) => {
    setAuthMode(mode);
    setLocalError(null);
    clearFeedback();
  };

  const handleSubmit = async () => {
    setLocalError(null);
    clearFeedback();

    if (authMode === 'login') {
      const cleanEmail = emailInput.trim().toLowerCase();
      if (!EMAIL_RE.test(cleanEmail)) {
        setLocalError('Masukkan alamat email yang valid.');
        return;
      }
      if (!passwordInput) {
        setLocalError('Masukkan password akun Anda.');
        return;
      }
      try {
        await loginAccount(cleanEmail, passwordInput);
      } catch {
        // Error banner already handled by DuaSakuContext
      }
      return;
    }

    const trimmedPartner = partnerNameInput.trim();
    if (trimmedPartner.length < 2) {
      setLocalError('Masukkan nama panggilan Anda (minimal 2 karakter).');
      return;
    }

    if (authMode === 'register') {
      const cleanEmail = emailInput.trim().toLowerCase();
      if (!EMAIL_RE.test(cleanEmail)) {
        setLocalError('Masukkan alamat email yang valid.');
        return;
      }
      if (passwordInput.length < 6) {
        setLocalError('Password minimal 6 karakter.');
        return;
      }
      if (registerScope === 'join') {
        const code = inviteCodeInput.trim().toUpperCase();
        if (code.length !== 6) {
          setLocalError('Masukkan kode undangan 6 karakter dari pasangan Anda.');
          return;
        }
        try {
          await registerAccount({
            email: cleanEmail,
            password: passwordInput,
            partnerName: trimmedPartner,
            mode: 'join',
            inviteCode: code,
          });
        } catch {
          // Error banner already handled by DuaSakuContext
        }
        return;
      }
      const trimmedCouple = coupleNameInput.trim() || 'Dompet Masa Depan';
      try {
        await registerAccount({
          email: cleanEmail,
          password: passwordInput,
          partnerName: trimmedPartner,
          mode: 'create',
          coupleName: trimmedCouple,
        });
      } catch {
        // Error banner already handled by DuaSakuContext
      }
      return;
    }

    if (authMode === 'join') {
      const code = inviteCodeInput.trim().toUpperCase();
      if (code.length !== 6) {
        setLocalError('Masukkan kode undangan 6 karakter dari pasangan Anda.');
        return;
      }
      try {
        await joinCouple(code, trimmedPartner);
      } catch {
        // Error banner already handled by DuaSakuContext
      }
      return;
    }

    const trimmedCouple = coupleNameInput.trim() || 'Dompet Masa Depan';
    try {
      await createCouple(trimmedCouple, trimmedPartner);
    } catch {
      // Error banner already handled by DuaSakuContext
    }
  };

  const submitLabel =
    authMode === 'login'
      ? 'Masuk ke Akun'
      : authMode === 'register'
        ? registerScope === 'join'
          ? 'Daftar & Gabung Ruang'
          : 'Daftar & Buat Ruang'
        : authMode === 'join'
          ? 'Gabung Sekarang'
          : 'Mulai & Dapatkan Kode Undangan';

  return (
    <AppFrame>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <FeedbackBanner feedback={feedback} onDismiss={clearFeedback} />

          <View style={styles.container}>
            <View style={styles.brandPill}>
              <Text style={styles.brandBadge}>DUASAKU · COUPLE FINANCE</Text>
            </View>
            <Text style={styles.title}>Keuangan & Target Masa Depan Pasangan</Text>
            <Text style={styles.subtitle}>
              Catat pengeluaran Menikah, Traveling, Investasi, dan pantau pemasukan-pengeluaran
              berdua secara real-time.
            </Text>

            <View style={styles.segmentGrid}>
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  style={[styles.segmentBtn, authMode === 'login' && styles.segmentBtnActive]}
                  onPress={() => switchMode('login')}
                  accessibilityRole="button"
                  testID="onboarding-mode-login"
                >
                  <Text
                    style={[
                      styles.segmentText,
                      authMode === 'login' && styles.segmentTextActive,
                    ]}
                  >
                    Masuk (Login)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, authMode === 'register' && styles.segmentBtnActive]}
                  onPress={() => switchMode('register')}
                  accessibilityRole="button"
                  testID="onboarding-mode-register"
                >
                  <Text
                    style={[
                      styles.segmentText,
                      authMode === 'register' && styles.segmentTextActive,
                    ]}
                  >
                    Daftar Akun
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.segmentRow}>
                <TouchableOpacity
                  style={[styles.segmentBtn, authMode === 'create' && styles.segmentBtnActive]}
                  onPress={() => switchMode('create')}
                  accessibilityRole="button"
                  testID="onboarding-mode-create"
                >
                  <Text
                    style={[
                      styles.segmentText,
                      authMode === 'create' && styles.segmentTextActive,
                    ]}
                  >
                    Buat Ruang Baru
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, authMode === 'join' && styles.segmentBtnActive]}
                  onPress={() => switchMode('join')}
                  accessibilityRole="button"
                  testID="onboarding-mode-join"
                >
                  <Text
                    style={[
                      styles.segmentText,
                      authMode === 'join' && styles.segmentTextActive,
                    ]}
                  >
                    Gabung Pasangan
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              {(authMode === 'login' || authMode === 'register') && (
                <>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={emailInput}
                    onChangeText={(text) => {
                      setEmailInput(text);
                      if (localError) setLocalError(null);
                    }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="Contoh: raka@duasaku.app"
                    placeholderTextColor={COLORS.textPlaceholder}
                    testID="onboarding-email-input"
                  />

                  <Text style={styles.label}>Password</Text>
                  <View style={styles.passwordWrap}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      value={passwordInput}
                      onChangeText={(text) => {
                        setPasswordInput(text);
                        if (localError) setLocalError(null);
                      }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      placeholder={
                        authMode === 'register' ? 'Minimal 6 karakter' : 'Masukkan password'
                      }
                      placeholderTextColor={COLORS.textPlaceholder}
                      returnKeyType={authMode === 'login' ? 'done' : 'next'}
                      onSubmitEditing={authMode === 'login' ? handleSubmit : undefined}
                      testID="onboarding-password-input"
                    />
                    <TouchableOpacity
                      style={styles.showPwdBtn}
                      onPress={() => setShowPassword((prev) => !prev)}
                      accessibilityRole="button"
                      testID="onboarding-toggle-password"
                    >
                      <Text style={styles.showPwdText}>
                        {showPassword ? 'Tutup' : 'Lihat'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {authMode === 'register' && (
                <View style={styles.subScopeRow}>
                  <TouchableOpacity
                    style={[
                      styles.subScopeChip,
                      registerScope === 'create' && styles.subScopeChipActive,
                    ]}
                    onPress={() => setRegisterScope('create')}
                    accessibilityRole="button"
                    testID="register-scope-create"
                  >
                    <Text
                      style={[
                        styles.subScopeText,
                        registerScope === 'create' && styles.subScopeTextActive,
                      ]}
                    >
                      Ruang Baru
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.subScopeChip,
                      registerScope === 'join' && styles.subScopeChipActive,
                    ]}
                    onPress={() => setRegisterScope('join')}
                    accessibilityRole="button"
                    testID="register-scope-join"
                  >
                    <Text
                      style={[
                        styles.subScopeText,
                        registerScope === 'join' && styles.subScopeTextActive,
                      ]}
                    >
                      Pakai Kode Undangan
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {(authMode === 'create' ||
                (authMode === 'register' && registerScope === 'create')) && (
                <>
                  <Text style={styles.label}>Nama Ruang Pasangan</Text>
                  <TextInput
                    style={styles.input}
                    value={coupleNameInput}
                    onChangeText={(text) => {
                      setCoupleNameInput(text);
                      if (localError) setLocalError(null);
                    }}
                    placeholder="Contoh: Dompet Masa Depan"
                    placeholderTextColor={COLORS.textPlaceholder}
                    testID="onboarding-couple-name-input"
                  />
                </>
              )}

              {(authMode === 'join' ||
                (authMode === 'register' && registerScope === 'join')) && (
                <>
                  <Text style={styles.label}>Kode Undangan dari Pasangan (6 Karakter)</Text>
                  <TextInput
                    style={styles.input}
                    value={inviteCodeInput}
                    onChangeText={(text) => {
                      setInviteCodeInput(text.toUpperCase());
                      if (localError) setLocalError(null);
                    }}
                    autoCapitalize="characters"
                    maxLength={6}
                    placeholder="Contoh: A1B2C3"
                    placeholderTextColor={COLORS.textPlaceholder}
                    testID="onboarding-invite-code-input"
                  />
                </>
              )}

              {authMode !== 'login' && (
                <>
                  <Text style={styles.label}>Nama Panggilan Anda</Text>
                  <TextInput
                    style={styles.input}
                    value={partnerNameInput}
                    onChangeText={(text) => {
                      setPartnerNameInput(text);
                      if (localError) setLocalError(null);
                    }}
                    placeholder="Contoh: Raka / Nadia"
                    placeholderTextColor={COLORS.textPlaceholder}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                    testID="onboarding-partner-name-input"
                  />
                </>
              )}

              {!!localError && (
                <View style={styles.inlineErrorBox} testID="onboarding-inline-error">
                  <Text style={styles.inlineErrorText}>{localError}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={handleSubmit}
                disabled={loading}
                accessibilityRole="button"
                testID="onboarding-submit-btn"
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>{submitLabel}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppFrame>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: SPACING.lg,
  },
  brandPill: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.terracottaSoft,
    borderColor: COLORS.terracotta,
    borderWidth: 1,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  brandBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.terracottaDark,
    letterSpacing: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs + 2,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    lineHeight: 19,
  },
  segmentGrid: {
    gap: SPACING.xs + 2,
    marginBottom: SPACING.md,
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.warmSand,
    borderRadius: RADII.md,
    padding: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: RADII.sm,
  },
  segmentBtnActive: {
    backgroundColor: COLORS.surface,
    ...SHADOWS.card,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  segmentTextActive: {
    color: COLORS.terracottaDark,
    fontWeight: '800',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.bgCream,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  passwordWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 64,
  },
  showPwdBtn: {
    position: 'absolute',
    right: SPACING.sm + 2,
    top: 9,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  showPwdText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
  subScopeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  subScopeChip: {
    flex: 1,
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.bgCream,
    alignItems: 'center',
  },
  subScopeChipActive: {
    backgroundColor: COLORS.terracottaSoft,
    borderColor: COLORS.terracotta,
  },
  subScopeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  subScopeTextActive: {
    color: COLORS.terracottaDark,
    fontWeight: '800',
  },
  inlineErrorBox: {
    backgroundColor: COLORS.terracottaSoft,
    borderWidth: 1,
    borderColor: COLORS.terracotta,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  inlineErrorText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.terracottaDark,
  },
  primaryBtn: {
    backgroundColor: COLORS.terracottaBtn,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md + 1,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    marginTop: SPACING.xs,
  },
  primaryBtnDisabled: {
    opacity: 0.65,
  },
  primaryBtnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 14,
  },
});
