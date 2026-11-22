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

export function OnboardingScreen(): React.JSX.Element {
  const { createCouple, joinCouple, loading, feedback, clearFeedback } = useDuaSaku();

  const [authMode, setAuthMode] = useState<'create' | 'join'>('create');
  const [coupleNameInput, setCoupleNameInput] = useState('Dompet Masa Depan');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [partnerNameInput, setPartnerNameInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const switchMode = (mode: 'create' | 'join') => {
    setAuthMode(mode);
    setLocalError(null);
    clearFeedback();
  };

  const handleSubmit = async () => {
    setLocalError(null);
    clearFeedback();

    const trimmedPartner = partnerNameInput.trim();
    if (trimmedPartner.length < 2) {
      setLocalError('Masukkan nama panggilan Anda (minimal 2 karakter).');
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

            <View style={styles.card}>
              {authMode === 'create' ? (
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
              ) : (
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
                  <Text style={styles.primaryBtnText}>
                    {authMode === 'create'
                      ? 'Mulai & Dapatkan Kode Undangan'
                      : 'Gabung Sekarang'}
                  </Text>
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
    paddingVertical: SPACING.xxl,
  },
  container: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
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
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    lineHeight: 21,
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.warmSand,
    borderRadius: RADII.md,
    padding: SPACING.xs,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
    borderRadius: RADII.sm,
  },
  segmentBtnActive: {
    backgroundColor: COLORS.surface,
    ...SHADOWS.card,
  },
  segmentText: {
    fontSize: 13,
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
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs + 2,
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
