import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useDuaSaku } from '../context/DuaSakuContext';
import { useKeyboardHeight } from '../hooks/useKeyboardVisible';
import { COLORS, RADII, SHADOWS, SPACING } from '../theme/tokens';
import { formatMonthLabel } from '../utils/format';
import { useAppLockSettings } from './AppLockGate';

export interface ProfileExportModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ProfileExportModal({
  visible,
  onClose,
}: ProfileExportModalProps): React.JSX.Element | null {
  const {
    couple,
    me,
    selectedMonth,
    loading,
    updateCoupleProfile,
    exportMonthlyReport,
  } = useDuaSaku();
  const { height } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();

  const [coupleName, setCoupleName] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const { pinEnabled, setPin, disablePin, lockApp } = useAppLockSettings();
  const [pinEditorOpen, setPinEditorOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinNotice, setPinNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCoupleName(couple?.coupleName ?? '');
    setPartnerName(me?.name ?? '');
    setFormError(null);
  }, [visible, couple?.coupleName, me?.name]);

  if (!visible) return null;

  const handleSaveProfile = async () => {
    setFormError(null);
    const trimmedCouple = coupleName.trim();
    const trimmedPartner = partnerName.trim();
    if (trimmedCouple.length < 2) {
      setFormError('Nama ruang pasangan minimal 2 karakter.');
      return;
    }
    if (trimmedPartner.length < 2) {
      setFormError('Nama Anda minimal 2 karakter.');
      return;
    }
    try {
      await updateCoupleProfile({
        coupleName: trimmedCouple,
        partnerName: trimmedPartner,
      });
      onClose();
    } catch {
      // Error surfaced via FeedbackBanner
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    setFormError(null);
    try {
      await exportMonthlyReport(format);
    } catch {
      // Error surfaced via FeedbackBanner
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      onRequestClose={() => {
        if (!loading) onClose();
      }}
      testID="profile-export-modal"
    >
      <View
        style={[
          styles.backdrop,
          Platform.OS === 'web' ? { minHeight: height } : undefined,
          keyboardHeight > 0 && styles.backdropKeyboard,
          keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : null,
        ]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            keyboardHeight > 0 && styles.scrollKeyboard,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          style={{
            maxHeight:
              keyboardHeight > 0
                ? Math.max(180, height - keyboardHeight - SPACING.lg * 2)
                : undefined,
          }}
        >
          <View style={styles.card}>
            <Text style={styles.title}>Profil Ruang & Ekspor Laporan</Text>

            <Text style={styles.sectionHeading}>Edit Profil Pasangan</Text>
            <Text style={styles.label}>Nama Ruang Pasangan</Text>
            <TextInput
              style={styles.input}
              value={coupleName}
              onChangeText={(txt) => {
                setCoupleName(txt);
                if (formError) setFormError(null);
              }}
              placeholder="Contoh: Dompet Masa Depan"
              placeholderTextColor={COLORS.textPlaceholder}
              testID="profile-couple-name-input"
            />

            <Text style={styles.label}>Nama Tampilan Anda ({me?.roleLabel ?? 'Partner'})</Text>
            <TextInput
              style={styles.input}
              value={partnerName}
              onChangeText={(txt) => {
                setPartnerName(txt);
                if (formError) setFormError(null);
              }}
              placeholder="Contoh: Raka"
              placeholderTextColor={COLORS.textPlaceholder}
              testID="profile-partner-name-input"
            />

            {!!formError && (
              <View style={styles.inlineErrorBox}>
                <Text style={styles.inlineErrorText}>{formError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, loading && styles.btnDisabled]}
              onPress={handleSaveProfile}
              disabled={loading}
              accessibilityRole="button"
              testID="profile-save-btn"
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Simpan Profil</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider} />

            <Text style={styles.sectionHeading}>
              Ekspor Laporan ({formatMonthLabel(selectedMonth)})
            </Text>
            <Text style={styles.exportSub}>
              Unduh ringkasan transaksi, anggaran, dan transfer bulan {selectedMonth}.
            </Text>

            <View style={styles.exportRow}>
              <TouchableOpacity
                style={[styles.exportBtn, styles.exportCsvBtn, loading && styles.btnDisabled]}
                onPress={() => handleExport('csv')}
                disabled={loading}
                accessibilityRole="button"
                testID="export-csv-btn"
              >
                <Text style={styles.exportCsvText}>Ekspor CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exportBtn, styles.exportJsonBtn, loading && styles.btnDisabled]}
                onPress={() => handleExport('json')}
                disabled={loading}
                accessibilityRole="button"
                testID="export-json-btn"
              >
                <Text style={styles.exportJsonText}>Ekspor JSON</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionHeading}>Keamanan Aplikasi (PIN 4 Digit)</Text>
            <Text style={styles.exportSub}>
              {pinEnabled
                ? 'Kunci PIN aktif. Perangkat akan meminta 4 digit PIN saat dibuka kembali.'
                : 'Lindungi catatan keuangan pasangan dengan kunci PIN 4 digit.'}
            </Text>

            {!!pinNotice && (
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.sageDark, marginBottom: SPACING.xs }}>
                {pinNotice}
              </Text>
            )}

            {pinEditorOpen ? (
              <View style={{ marginBottom: SPACING.sm }}>
                <TextInput
                  style={styles.input}
                  value={pinInput}
                  onChangeText={(txt) => setPinInput(txt.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={4}
                  placeholder="Masukkan 4 digit PIN"
                  placeholderTextColor={COLORS.textPlaceholder}
                  testID="profile-pin-input"
                />
                <View style={styles.exportRow}>
                  <TouchableOpacity
                    style={[styles.exportBtn, styles.exportCsvBtn]}
                    onPress={() => {
                      const res = setPin(pinInput);
                      if (!res.ok) {
                        setFormError(res.error || 'PIN harus 4 digit angka.');
                        return;
                      }
                      setPinInput('');
                      setPinEditorOpen(false);
                      setPinNotice('PIN 4 digit berhasil diaktifkan.');
                    }}
                    testID="profile-pin-save-btn"
                  >
                    <Text style={styles.exportCsvText}>Simpan PIN</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.exportBtn, styles.exportJsonBtn]}
                    onPress={() => {
                      setPinEditorOpen(false);
                      setPinInput('');
                    }}
                  >
                    <Text style={styles.exportJsonText}>Batal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.exportRow}>
                <TouchableOpacity
                  style={[styles.exportBtn, styles.exportCsvBtn]}
                  onPress={() => {
                    setPinNotice(null);
                    setPinEditorOpen(true);
                  }}
                  testID="profile-pin-setup-btn"
                >
                  <Text style={styles.exportCsvText}>
                    {pinEnabled ? 'Ubah PIN' : 'Aktifkan PIN'}
                  </Text>
                </TouchableOpacity>
                {pinEnabled && (
                  <>
                    <TouchableOpacity
                      style={[styles.exportBtn, styles.exportJsonBtn]}
                      onPress={() => {
                        onClose();
                        lockApp();
                      }}
                      testID="profile-pin-lock-btn"
                    >
                      <Text style={styles.exportJsonText}>Kunci</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.exportBtn, styles.exportJsonBtn]}
                      onPress={() => {
                        disablePin();
                        setPinNotice('PIN dimatikan.');
                      }}
                      testID="profile-pin-disable-btn"
                    >
                      <Text style={styles.exportJsonText}>Matikan</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            <View style={styles.footerRow}>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                disabled={loading}
                accessibilityRole="button"
                testID="profile-close-btn"
              >
                <Text style={styles.closeBtnText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.backdrop,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  backdropKeyboard: {
    justifyContent: 'flex-start',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  scrollKeyboard: {
    justifyContent: 'flex-start',
  },
  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.elevated,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
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
  saveBtn: {
    backgroundColor: COLORS.terracottaBtn,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.white,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.lg,
  },
  exportSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  exportRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  exportBtn: {
    flex: 1,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    borderWidth: 1,
  },
  exportCsvBtn: {
    backgroundColor: COLORS.sageBtn,
    borderColor: COLORS.sageBtn,
  },
  exportCsvText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.white,
  },
  exportJsonBtn: {
    backgroundColor: COLORS.warmSand,
    borderColor: COLORS.borderStrong,
  },
  exportJsonText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closeBtn: {
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    minHeight: 40,
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});
