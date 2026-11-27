import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppFrame } from '../components/AppFrame';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { DashboardHero } from '../components/DashboardHero';
import { ChipGroup } from '../components/ChipGroup';
import { PressableButton } from '../components/PressableButton';
import { useDuaSaku } from '../context/DuaSakuContext';
import { COLORS, RADII, SHADOWS, SPACING } from '../theme/tokens';

type FlowStep = 'welcome' | 'login' | 'register_account' | 'setup_space';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OnboardingScreen(): React.JSX.Element {
  const {
    loginAccount,
    registerAccount,
    loading,
    feedback,
    clearFeedback,
  } = useDuaSaku();

  const [step, setStep] = useState<FlowStep>('welcome');
  const [spaceMode, setSpaceMode] = useState<'create' | 'join'>('create');
  const [partnerNameInput, setPartnerNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [coupleNameInput, setCoupleNameInput] = useState('Dompet Masa Depan');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const goToStep = (next: FlowStep) => {
    setStep(next);
    setLocalError(null);
    clearFeedback();
  };

  const handleLoginSubmit = async () => {
    setLocalError(null);
    clearFeedback();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      setLocalError('Format email belum pas. Cek lagi, ya.');
      return;
    }
    if (!passwordInput) {
      setLocalError('Masukkan password akunmu dulu, ya.');
      return;
    }
    try {
      await loginAccount(cleanEmail, passwordInput);
    } catch {
      // Error banner already handled by DuaSakuContext
    }
  };

  const handleRegisterAccountNext = () => {
    setLocalError(null);
    clearFeedback();
    if (partnerNameInput.trim().length < 2) {
      setLocalError('Isi nama panggilan minimal 2 karakter, ya.');
      return;
    }
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      setLocalError('Format email belum pas. Cek lagi, ya.');
      return;
    }
    if (passwordInput.length < 6) {
      setLocalError('Password minimal 6 karakter biar akun tetap aman.');
      return;
    }
    goToStep('setup_space');
  };

  const handleSetupSpaceSubmit = async () => {
    setLocalError(null);
    clearFeedback();
    const trimmedPartner = partnerNameInput.trim();
    const cleanEmail = emailInput.trim().toLowerCase();

    if (spaceMode === 'join') {
      const code = inviteCodeInput.trim().toUpperCase();
      if (code.length !== 6) {
        setLocalError('Kode undangan harus 6 karakter huruf/angka dari pasanganmu.');
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
  };

  return (
    <AppFrame>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            step === 'welcome' && styles.welcomeScrollContent,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <FeedbackBanner feedback={feedback} onDismiss={clearFeedback} />

          {step === 'welcome' && (
            <View style={styles.welcomeContainer}>
              <Text style={styles.logoText}>💰 DuaSaku</Text>
              <DashboardHero
                kicker="DUASAKU · KEUANGAN PASANGAN"
                amount="Rp 14.650.000"
                subtitle="Dompet Masa Depan · Raka & Nadia"
                padding="xl"
                testID="onboarding-hero"
                children={
                  <View style={styles.heroChipsRow} testID="onboarding-hero-chips">
                    <View style={styles.heroChip}>
                      <Text style={styles.heroChipText}>💍 Menikah · 68%</Text>
                    </View>
                    <View style={styles.heroChip}>
                      <Text style={styles.heroChipText}>✈️ Traveling</Text>
                    </View>
                    <View style={styles.heroChip}>
                      <Text style={styles.heroChipText}>📈 Investasi</Text>
                    </View>
                  </View>
                }
              />

              <Text style={styles.welcomeTitle}>Atur Uang Berdua, Tanpa Drama.</Text>
              <Text style={styles.welcomeSubtitle}>
                Satu ruang hangat untuk pantau pemasukan, pengeluaran, dan tabungan impian kalian
                secara real-time.
              </Text>

              <View style={styles.valuePropsList}>
                <View style={styles.valuePropRow}>
                  <View style={[styles.valueIconBadge, { backgroundColor: COLORS.terracottaSoft }]}>
                    <Text style={styles.valueIconText}>⚡</Text>
                  </View>
                  <Text style={styles.valuePropText}>
                    Catat transaksi harian berdua, langsung tersinkron
                  </Text>
                </View>
                <View style={styles.valuePropRow}>
                  <View style={[styles.valueIconBadge, { backgroundColor: COLORS.sageSoft }]}>
                    <Text style={styles.valueIconText}>🎯</Text>
                  </View>
                  <Text style={styles.valuePropText}>
                    Pantau pos Menikah, Traveling, hingga Investasi
                  </Text>
                </View>
                <View style={styles.valuePropRow}>
                  <View style={[styles.valueIconBadge, { backgroundColor: COLORS.ochreSoft }]}>
                    <Text style={styles.valueIconText}>💬</Text>
                  </View>
                  <Text style={styles.valuePropText}>
                    Anggaran bulanan jelas, semua terasa lebih ringan
                  </Text>
                </View>
              </View>

              <View style={styles.welcomeCtaStack}>
                <PressableButton
                  variant="primary"
                  size="lg"
                  onPress={() => goToStep('register_account')}
                  testID="welcome-create-account-btn"
                >
                  Buat Akun
                </PressableButton>
                <PressableButton
                  variant="secondary"
                  size="lg"
                  onPress={() => goToStep('login')}
                  testID="welcome-login-btn"
                >
                  Masuk
                </PressableButton>
                <Text style={styles.microFooter}>
                  Gratis untuk mulai · Siap dipakai berdua dalam 1 menit
                </Text>
              </View>
            </View>
          )}

          {step === 'login' && (
            <View style={styles.formContainer}>
              <View style={styles.topBar}>
                              <PressableButton
                                variant="ghost"
                                size="sm"
                                onPress={() => goToStep('welcome')}
                                testID="onboarding-back-btn"
                              >
                                ← Kembali
                              </PressableButton>
                            </View>

              <Text style={styles.stepTitle}>Senang Melihatmu Lagi</Text>
              <Text style={styles.stepSubtitle}>
                Masuk dengan email dan password untuk lanjut mengelola ruang keuangan kalian.
              </Text>

              <View style={styles.card}>
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
                  placeholder="nama@email.com"
                  placeholderTextColor={COLORS.textPlaceholder}
                  testID="login-email-input"
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
                    placeholder="Masukkan password akunmu"
                    placeholderTextColor={COLORS.textPlaceholder}
                    returnKeyType="done"
                    onSubmitEditing={handleLoginSubmit}
                    testID="login-password-input"
                  />
                  <PressableButton
                    variant="ghost"
                    size="sm"
                    onPress={() => setShowPassword((prev) => !prev)}
                    testID="onboarding-toggle-password"
                  >
                    <Text style={styles.showPwdText}>{showPassword ? 'Tutup' : 'Lihat'}</Text>
                  </PressableButton>
                </View>

                {!!localError && (
                  <View style={styles.inlineErrorBox} testID="onboarding-inline-error">
                    <Text style={styles.inlineErrorText}>{localError}</Text>
                  </View>
                )}

                <PressableButton
                  variant="primary"
                  size="lg"
                  onPress={handleLoginSubmit}
                  disabled={loading}
                  testID="login-submit-btn"
                >
                  {loading ? 'Memproses...' : 'Masuk ke Ruang'}
                </PressableButton>
              </View>

              <PressableButton
                variant="ghost"
                size="sm"
                onPress={() => goToStep('register_account')}
                testID="switch-to-register-btn"
              >
                Belum punya akun? <Text style={styles.switchLinkBold}>Buat Akun</Text>
              </PressableButton>
            </View>
          )}

          {step === 'register_account' && (
            <View style={styles.formContainer}>
              <View style={styles.topBar}>
                <PressableButton
                  variant="ghost"
                  size="sm"
                  onPress={() => goToStep('welcome')}
                  testID="onboarding-back-btn"
                >
                  ← Kembali
                </PressableButton>
                <View style={styles.stepPill}>
                  <Text style={styles.stepPillText}>Langkah 1 dari 2</Text>
                </View>
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: '50%' }]} />
              </View>

              <Text style={styles.stepTitle}>Kenalan Dulu, Yuk</Text>
              <Text style={styles.stepSubtitle}>
                Buat akun pribadimu dulu. Setelah ini, kamu tinggal buat ruang baru atau gabung
                dengan pasangan.
              </Text>

              <View style={styles.card}>
                <Text style={styles.label}>Nama Panggilan</Text>
                <TextInput
                  style={styles.input}
                  value={partnerNameInput}
                  onChangeText={(text) => {
                    setPartnerNameInput(text);
                    if (localError) setLocalError(null);
                  }}
                  placeholder="Contoh: Raka atau Nadia"
                  placeholderTextColor={COLORS.textPlaceholder}
                  testID="register-partner-name-input"
                />
                <Text style={styles.helperText}>
                  Nama ini akan tampil di setiap catatan transaksimu.
                </Text>

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
                  placeholder="nama@email.com"
                  placeholderTextColor={COLORS.textPlaceholder}
                  testID="register-email-input"
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
                    placeholder="Minimal 6 karakter"
                    placeholderTextColor={COLORS.textPlaceholder}
                    returnKeyType="done"
                    onSubmitEditing={handleRegisterAccountNext}
                    testID="register-password-input"
                  />
                  <PressableButton
                    variant="ghost"
                    size="sm"
                    onPress={() => setShowPassword((prev) => !prev)}
                    testID="onboarding-toggle-password"
                  >
                    <Text style={styles.showPwdText}>{showPassword ? 'Tutup' : 'Lihat'}</Text>
                  </PressableButton>
                </View>

                {!!localError && (
                  <View style={styles.inlineErrorBox} testID="onboarding-inline-error">
                    <Text style={styles.inlineErrorText}>{localError}</Text>
                  </View>
                )}

                <PressableButton
                  variant="primary"
                  size="lg"
                  onPress={handleRegisterAccountNext}
                  testID="register-next-btn"
                >
                  Lanjut Pilih Ruang
                </PressableButton>
              </View>

              <PressableButton
                variant="ghost"
                size="sm"
                onPress={() => goToStep('login')}
                testID="switch-to-login-btn"
              >
                Sudah punya akun? <Text style={styles.switchLinkBold}>Masuk</Text>
              </PressableButton>
            </View>
          )}

          {step === 'setup_space' && (
            <View style={styles.formContainer}>
              <View style={styles.topBar}>
                <PressableButton
                  variant="ghost"
                  size="sm"
                  onPress={() => goToStep('register_account')}
                  testID="onboarding-back-btn"
                >
                  ← Kembali
                </PressableButton>
                <View style={styles.stepPill}>
                  <Text style={styles.stepPillText}>Langkah 2 dari 2</Text>
                </View>
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: '100%' }]} />
              </View>

              <Text style={styles.stepTitle}>Siapkan Ruang Berdua</Text>
              <Text style={styles.stepSubtitle}>
                Halo, {partnerNameInput.trim()}! Pilih cara menghubungkan keuangan kalian.
              </Text>

              <View style={styles.card}>
                <View style={styles.optionRow}>
                  <PressableButton
                    variant="ghost"
                    size="md"
                    style={[
                      styles.optionCard,
                      spaceMode === 'create' && styles.optionCardActive,
                    ].flat() as any}
                    onPress={() => {
                      setSpaceMode('create');
                      setLocalError(null);
                    }}
                    testID="setup-mode-create"
                    children={
                      <>
                        <Text
                          style={[
                            styles.optionTitle,
                            spaceMode === 'create' && styles.optionTitleActive,
                          ].flat() as any}
                        >
                          Buat Ruang Baru
                        </Text>
                        <Text style={styles.optionDesc}>
                          Dapatkan kode undangan untuk pasangan.
                        </Text>
                      </>
                    }
                  />

                  <PressableButton
                    variant="ghost"
                    size="md"
                    style={[
                      styles.optionCard,
                      spaceMode === 'join' && styles.optionCardActive,
                    ].flat() as any}
                    onPress={() => {
                      setSpaceMode('join');
                      setLocalError(null);
                    }}
                    testID="setup-mode-join"
                    children={
                      <>
                        <Text
                          style={[
                            styles.optionTitle,
                            spaceMode === 'join' && styles.optionTitleActive,
                          ].flat() as any}
                        >
                          Gabung Pasangan
                        </Text>
                        <Text style={styles.optionDesc}>
                          Punya kode 6 karakter? Gabung di sini.
                        </Text>
                      </>
                    }
                  />
                </View>

                {spaceMode === 'create' ? (
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
                      returnKeyType="done"
                      onSubmitEditing={handleSetupSpaceSubmit}
                      testID="setup-couple-name-input"
                    />
                    <Text style={styles.helperText}>
                      Nama ini bisa diubah kapan saja di Pengaturan.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>Kode Undangan (6 Karakter)</Text>
                    <TextInput
                      style={[styles.input, styles.codeInput]}
                      value={inviteCodeInput}
                      onChangeText={(text) => {
                        setInviteCodeInput(text.toUpperCase());
                        if (localError) setLocalError(null);
                      }}
                      autoCapitalize="characters"
                      maxLength={6}
                      placeholder="A1B2C3"
                      placeholderTextColor={COLORS.textPlaceholder}
                      returnKeyType="done"
                      onSubmitEditing={handleSetupSpaceSubmit}
                      testID="setup-invite-code-input"
                    />
                    <Text style={styles.helperText}>
                      Minta kode 6 karakter dari pasangan yang sudah membuat ruang.
                    </Text>
                  </>
                )}

                {!!localError && (
                  <View style={styles.inlineErrorBox} testID="onboarding-inline-error">
                    <Text style={styles.inlineErrorText}>{localError}</Text>
                  </View>
                )}

                <PressableButton
                  variant="primary"
                  size="lg"
                  onPress={handleSetupSpaceSubmit}
                  disabled={loading}
                  testID="setup-submit-btn"
                >
                  {loading
                    ? 'Memproses...'
                    : spaceMode === 'join'
                    ? 'Buat Akun & Gabung Ruang'
                    : 'Buat Akun & Mulai Ruang'}
                </PressableButton>
              </View>

              <PressableButton
                variant="ghost"
                size="sm"
                onPress={() => goToStep('login')}
                testID="setup-switch-login-btn"
              >
                Sudah terdaftar? <Text style={styles.switchLinkBold}>Masuk</Text>
              </PressableButton>
            </View>
          )}
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
    paddingVertical: SPACING.xl,
  },
  welcomeScrollContent: {
    justifyContent: 'space-between',
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
  },
  brandPill: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.terracottaSoft,
    borderColor: COLORS.terracotta,
    borderWidth: 1,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.md,
  },
  brandBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.terracottaDark,
    letterSpacing: 1,
  },
  heroCard: {
    backgroundColor: COLORS.heroCocoa,
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.hero,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heroSubtle,
    marginBottom: SPACING.xs,
  },
  heroAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  heroChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs + 2,
  },
  heroChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
  },
  heroChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.white,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.terracotta,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    lineHeight: 31,
    marginBottom: SPACING.xs + 2,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  valuePropsList: {
    gap: 10,
  },
  valuePropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  valueIconBadge: {
    width: 28,
    height: 28,
    borderRadius: RADII.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueIconText: {
    fontSize: 14,
  },
  valuePropText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  welcomeCtaStack: {
    marginTop: SPACING.xl,
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  backBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: SPACING.md,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  stepPill: {
    backgroundColor: COLORS.warmSand,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  progressTrack: {
    height: 4,
    backgroundColor: COLORS.warmSand,
    borderRadius: RADII.pill,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.terracotta,
    borderRadius: RADII.pill,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    lineHeight: 28,
  },
  stepSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
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
    minHeight: 48,
    backgroundColor: COLORS.bgCream,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    paddingHorizontal: 14,
    paddingVertical: SPACING.sm + 2,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 4,
  },
  helperText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: -8,
    marginBottom: SPACING.md,
    lineHeight: 16,
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
    top: 11,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  showPwdText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
  optionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  optionCard: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    backgroundColor: COLORS.bgCream,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  optionCardActive: {
    backgroundColor: COLORS.terracottaSoft,
    borderColor: COLORS.terracotta,
    borderWidth: 1.5,
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 3,
  },
  optionTitleActive: {
    color: COLORS.terracottaDark,
  },
  optionDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
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
    minHeight: 50,
    marginBottom: SPACING.sm + 2,
  },
  primaryBtnDisabled: {
    opacity: 0.65,
  },
  primaryBtnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryBtnText: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  microFooter: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  switchLinkBtn: {
    marginTop: SPACING.lg,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchLinkText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  switchLinkBold: {
    color: COLORS.terracottaDark,
    fontWeight: '800',
  },
});
