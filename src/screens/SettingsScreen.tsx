import React, { useEffect, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppFrame } from '../components/AppFrame';
import { useAppLockSettings } from '../components/AppLockGate';
import { ModalForm } from '../components/ModalForm';
import { PressableButton } from '../components/PressableButton';
import { useDuaSaku } from '../context/DuaSakuContext';
import { COLORS, RADII, SHADOWS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import { formatMonthLabel } from '../utils/format';
import { getStorageItem, setStorageItem } from '../utils/storage';

const PREFS_STORAGE_KEY = 'duasaku_prefs_v1';

interface UserPreferences {
  currency: 'IDR' | 'USD' | 'SGD';
  dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD';
  compactNumbers: boolean;
  budgetAlerts: boolean;
  dailyReminder: boolean;
}

const DEFAULT_PREFS: UserPreferences = {
  currency: 'IDR',
  dateFormat: 'DD/MM/YYYY',
  compactNumbers: false,
  budgetAlerts: true,
  dailyReminder: false,
};

const CURRENCY_LABELS: Record<UserPreferences['currency'], string> = {
  IDR: 'IDR (Rp)',
  USD: 'USD ($)',
  SGD: 'SGD (S$)',
};

function loadPreferences(): UserPreferences {
  try {
    const raw = getStorageItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function SettingsScreen(): React.JSX.Element {
  const {
    couple,
    me,
    accounts,
    categories,
    budgets,
    selectedMonth,
    loading,
    setActiveTab,
    updateCoupleProfile,
    exportMonthlyReport,
    requestConfirm,
    showError,
    showSuccess,
    logout,
  } = useDuaSaku();

  const { pinEnabled, setPin, changePin, disablePin, lockApp } = useAppLockSettings();

  const [prefs, setPrefs] = useState<UserPreferences>(() => loadPreferences());
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [coupleNameInput, setCoupleNameInput] = useState('');
  const [partnerNameInput, setPartnerNameInput] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  useEffect(() => {
    setCoupleNameInput(couple?.coupleName ?? '');
    setPartnerNameInput(me?.name ?? '');
  }, [couple?.coupleName, me?.name]);

  const updatePref = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      setStorageItem(PREFS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleSaveProfile = async () => {
    setProfileError(null);
    const trimmedCouple = coupleNameInput.trim();
    const trimmedPartner = partnerNameInput.trim();
    if (trimmedCouple.length < 2) {
      setProfileError('Nama ruang pasangan minimal 2 karakter.');
      return;
    }
    if (trimmedPartner.length < 2) {
      setProfileError('Nama partner minimal 2 karakter.');
      return;
    }
    await updateCoupleProfile({ coupleName: trimmedCouple, partnerName: trimmedPartner });
    setProfileModalOpen(false);
  };

  const handleSavePin = () => {
    setPinError(null);
    const result = pinEnabled
      ? changePin(currentPinInput.trim(), newPinInput.trim())
      : setPin(newPinInput.trim());
    if (!result.ok) {
      setPinError(result.error ?? 'PIN tidak valid (harus 4 digit angka).');
      return;
    }
    setCurrentPinInput('');
    setNewPinInput('');
    setPinModalOpen(false);
    showSuccess(pinEnabled ? 'PIN keamanan berhasil diperbarui.' : 'Kunci PIN 4 digit diaktifkan.');
  };

  const handleDisablePin = () => {
    const result = disablePin(pinEnabled ? currentPinInput.trim() : undefined);
    if (!result.ok) {
      setPinError(result.error ?? 'Masukkan PIN saat ini untuk menonaktifkan.');
      return;
    }
    setCurrentPinInput('');
    setNewPinInput('');
    setPinModalOpen(false);
    showSuccess('Kunci PIN dinonaktifkan.');
  };

  const handleCopyInvite = async () => {
    const code = couple?.inviteCode;
    if (!code) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
        showSuccess(`Kode undangan ${code} disalin.`);
        return;
      }
      showSuccess(`Kode undangan ruang: ${code}`);
    } catch {
      showError('Gagal menyalin kode undangan.');
    }
  };

  const handleLogoutConfirm = () => {
    requestConfirm({
      title: 'Keluar dari Ruang?',
      message: 'Sesi Anda di perangkat ini akan ditutup. Anda bisa masuk kembali kapan saja dengan kode undangan.',
      confirmLabel: 'Keluar',
      cancelLabel: 'Batal',
      destructive: true,
      onConfirm: () => {
        logout();
      },
    });
  };

  const cycleCurrency = () => {
    const order: UserPreferences['currency'][] = ['IDR', 'USD', 'SGD'];
    const next = order[(order.indexOf(prefs.currency) + 1) % order.length];
    updatePref('currency', next);
    showSuccess(`Mata uang tampilan diubah ke ${CURRENCY_LABELS[next]}`);
  };

  const toggleDateFormat = () => {
    const next = prefs.dateFormat === 'DD/MM/YYYY' ? 'YYYY-MM-DD' : 'DD/MM/YYYY';
    updatePref('dateFormat', next);
    showSuccess(`Format tanggal diubah ke ${next}`);
  };

  return (
    <AppFrame>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <Text style={TYPOGRAPHY.title}>Pengaturan</Text>
          <Text style={TYPOGRAPHY.caption}>
            Kelola profil, keamanan PIN, preferensi tampilan, dan ruang pasangan
          </Text>
        </View>

        {/* 1. Profil & Ruang Pasangan */}
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: me?.avatarColor ?? COLORS.terracotta }]}>
              <Text style={styles.avatarText}>{(me?.name ?? 'D').slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.flex1}>
              <Text style={TYPOGRAPHY.cardTitle} testID="settings-profile-name">
                {me?.name ?? 'Partner'}
              </Text>
              <Text style={TYPOGRAPHY.caption}>
                {me?.roleLabel ?? 'Partner'} · {couple?.coupleName ?? 'Ruang Dua Saku'}
              </Text>
            </View>
            <PressableButton
              variant="secondary"
              size="sm"
              testID="settings-edit-profile-btn"
              onPress={() => {
                setProfileError(null);
                setProfileModalOpen(true);
              }}
            >
              Ubah
            </PressableButton>
          </View>

          <View style={styles.divider} />

          <View style={styles.rowBetween}>
            <View style={styles.flex1}>
              <Text style={styles.itemTitle}>Kode Undangan Ruang</Text>
              <Text style={styles.itemSub}>
                {couple?.partners?.length ?? 1} partner terhubung · Kode: {couple?.inviteCode ?? '-'}
              </Text>
            </View>
            <PressableButton
              variant="ghost"
              size="sm"
              testID="settings-copy-invite-btn"
              onPress={handleCopyInvite}
            >
              Salin Kode
            </PressableButton>
          </View>
        </View>

        {/* 2. Keamanan */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>KEAMANAN</Text>
          <View style={styles.rowBetween}>
            <View style={styles.flex1}>
              <Text style={styles.itemTitle}>Kunci Aplikasi (PIN 4 Digit)</Text>
              <Text style={styles.itemSub}>
                {pinEnabled ? 'Aktif — melindungi akses saat aplikasi dibuka' : 'Nonaktif'}
              </Text>
            </View>
            <PressableButton
              variant="secondary"
              size="sm"
              testID="settings-pin-btn"
              onPress={() => {
                setPinError(null);
                setCurrentPinInput('');
                setNewPinInput('');
                setPinModalOpen(true);
              }}
            >
              {pinEnabled ? 'Kelola PIN' : 'Atur PIN'}
            </PressableButton>
          </View>

          {pinEnabled && (
            <>
              <View style={styles.divider} />
              <PressableButton
                variant="ghost"
                size="sm"
                testID="settings-lock-now-btn"
                onPress={lockApp}
              >
                🔒 Kunci Aplikasi Sekarang
              </PressableButton>
            </>
          )}
        </View>

        {/* 3. Mata Uang & Preferensi */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>MATA UANG & PREFERENSI</Text>

          <TouchableOpacity
            style={styles.rowItem}
            onPress={cycleCurrency}
            activeOpacity={0.75}
            testID="settings-currency-row"
          >
            <View style={styles.flex1}>
              <Text style={styles.itemTitle}>Mata Uang Tampilan</Text>
              <Text style={styles.itemSub}>Ketuk untuk mengganti mata uang</Text>
            </View>
            <Text style={styles.badgeValue}>{CURRENCY_LABELS[prefs.currency]}</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.rowItem}
            onPress={toggleDateFormat}
            activeOpacity={0.75}
            testID="settings-date-format-row"
          >
            <View style={styles.flex1}>
              <Text style={styles.itemTitle}>Format Tanggal</Text>
              <Text style={styles.itemSub}>Ketuk untuk beralih format</Text>
            </View>
            <Text style={styles.badgeValue}>{prefs.dateFormat}</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.rowItem}>
            <View style={styles.flex1}>
              <Text style={styles.itemTitle}>Ringkas Angka Besar</Text>
              <Text style={styles.itemSub}>Contoh: Rp 1,5 jt alih-alih Rp 1.500.000</Text>
            </View>
            <Switch
              value={prefs.compactNumbers}
              onValueChange={(v) => updatePref('compactNumbers', v)}
              trackColor={{ false: COLORS.border, true: COLORS.sage }}
              thumbColor={COLORS.white}
              testID="settings-compact-switch"
            />
          </View>
        </View>

        {/* 4. Notifikasi */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>NOTIFIKASI</Text>

          <View style={styles.rowItem}>
            <View style={styles.flex1}>
              <Text style={styles.itemTitle}>Peringatan Anggaran</Text>
              <Text style={styles.itemSub}>Tandai saat pemakaian kategori melewati 80%</Text>
            </View>
            <Switch
              value={prefs.budgetAlerts}
              onValueChange={(v) => updatePref('budgetAlerts', v)}
              trackColor={{ false: COLORS.border, true: COLORS.sage }}
              thumbColor={COLORS.white}
              testID="settings-budget-alert-switch"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.rowItem}>
            <View style={styles.flex1}>
              <Text style={styles.itemTitle}>Pengingat Catat Harian</Text>
              <Text style={styles.itemSub}>Ingatkan mencatat transaksi sebelum malam</Text>
            </View>
            <Switch
              value={prefs.dailyReminder}
              onValueChange={(v) => updatePref('dailyReminder', v)}
              trackColor={{ false: COLORS.border, true: COLORS.sage }}
              thumbColor={COLORS.white}
              testID="settings-reminder-switch"
            />
          </View>
        </View>

        {/* 5. Pengelolaan Data & Ekspor */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>DATA & PENGELOLAAN</Text>

          <TouchableOpacity
            style={styles.rowItem}
            onPress={() => setActiveTab('budgets')}
            testID="settings-nav-budgets"
          >
            <View style={styles.flex1}>
              <Text style={styles.itemTitle}>Anggaran Bulanan</Text>
              <Text style={styles.itemSub}>{budgets.length} batas anggaran aktif bulan ini</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.rowItem}
            onPress={() => setActiveTab('categories')}
            testID="settings-nav-categories"
          >
            <View style={styles.flex1}>
              <Text style={styles.itemTitle}>Kategori</Text>
              <Text style={styles.itemSub}>{categories.length} kategori pengeluaran & pemasukan</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.rowItem}
            onPress={() => setActiveTab('accounts')}
            testID="settings-nav-accounts"
          >
            <View style={styles.flex1}>
              <Text style={styles.itemTitle}>Akun & Dompet</Text>
              <Text style={styles.itemSub}>{accounts.length} dompet / rekening terdaftar</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.exportRow}>
            <PressableButton
              variant="secondary"
              size="sm"
              disabled={loading}
              testID="settings-export-csv-btn"
              onPress={() => exportMonthlyReport('csv')}
              style={styles.flex1}
            >
              Ekspor CSV ({formatMonthLabel(selectedMonth)})
            </PressableButton>
            <PressableButton
              variant="ghost"
              size="sm"
              disabled={loading}
              testID="settings-export-json-btn"
              onPress={() => exportMonthlyReport('json')}
            >
              JSON
            </PressableButton>
          </View>
        </View>

        {/* 6. Tentang & Keluar */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.rowItem}
            onPress={() => setAboutModalOpen(true)}
            testID="settings-about-row"
          >
            <View style={styles.flex1}>
              <Text style={styles.itemTitle}>Tentang Dua Saku</Text>
              <Text style={styles.itemSub}>Versi 1.0.0 · Kebijakan Privasi & Keamanan</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <PressableButton
          variant="danger"
          size="md"
          testID="settings-logout-btn"
          onPress={handleLogoutConfirm}
        >
          Keluar dari Ruang
        </PressableButton>
      </ScrollView>

      {/* Modal Edit Profil */}
      <ModalForm
        visible={profileModalOpen}
        title="Ubah Profil & Ruang"
        onClose={() => setProfileModalOpen(false)}
        submitLabel="Simpan"
        onSubmit={handleSaveProfile}
        submitting={loading}
        testID="settings-profile-modal"
      >
        <Text style={styles.modalSub}>Perubahan langsung tersinkron ke ruang pasangan Anda.</Text>
        <Text style={styles.fieldLabel}>Nama Ruang Pasangan</Text>
        <TextInput
          style={styles.input}
          value={coupleNameInput}
          onChangeText={setCoupleNameInput}
          placeholder="Contoh: Ruang Kita"
          placeholderTextColor={COLORS.textPlaceholder}
          testID="settings-couple-name-input"
        />
        <Text style={styles.fieldLabel}>Nama Anda</Text>
        <TextInput
          style={styles.input}
          value={partnerNameInput}
          onChangeText={setPartnerNameInput}
          placeholder="Nama panggilan Anda"
          placeholderTextColor={COLORS.textPlaceholder}
          testID="settings-partner-name-input"
        />
        {!!profileError && <Text style={styles.errorText}>{profileError}</Text>}
      </ModalForm>

      {/* Modal Kelola PIN */}
      <ModalForm
        visible={pinModalOpen}
        title={pinEnabled ? 'Kelola PIN Keamanan' : 'Atur PIN 4 Digit'}
        onClose={() => setPinModalOpen(false)}
        submitLabel={pinEnabled ? 'Perbarui PIN' : 'Aktifkan PIN'}
        onSubmit={handleSavePin}
        testID="settings-pin-modal"
      >
        <Text style={styles.modalSub}>PIN di-hash secara lokal (SHA-256) di perangkat Anda.</Text>
        {pinEnabled && (
          <>
            <Text style={styles.fieldLabel}>PIN Saat Ini</Text>
            <TextInput
              style={styles.input}
              value={currentPinInput}
              onChangeText={setCurrentPinInput}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              placeholder="••••"
              placeholderTextColor={COLORS.textPlaceholder}
              testID="settings-current-pin-input"
            />
          </>
        )}
        <Text style={styles.fieldLabel}>{pinEnabled ? 'PIN Baru (4 digit)' : 'PIN Baru (4 digit angka)'}</Text>
        <TextInput
          style={styles.input}
          value={newPinInput}
          onChangeText={setNewPinInput}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
          placeholder="••••"
          placeholderTextColor={COLORS.textPlaceholder}
          testID="settings-new-pin-input"
        />
        {!!pinError && <Text style={styles.errorText}>{pinError}</Text>}
        {pinEnabled && (
          <View style={styles.disablePinWrap}>
            <PressableButton
              variant="danger"
              size="sm"
              testID="settings-disable-pin-btn"
              onPress={handleDisablePin}
            >
              Nonaktifkan Kunci PIN
            </PressableButton>
          </View>
        )}
      </ModalForm>

      {/* Modal Tentang */}
      <ModalForm
        visible={aboutModalOpen}
        title="Tentang Dua Saku"
        submitLabel="Tutup"
        onSubmit={() => setAboutModalOpen(false)}
        onClose={() => setAboutModalOpen(false)}
        testID="settings-about-modal"
      >
        <Text style={styles.modalSub}>Versi 1.0.0 · Keuangan Pasangan & Pribadi</Text>
        <Text style={styles.aboutText}>
          Dua Saku membantu memisahkan dan mengelola saku pribadi serta saku bersama secara transparan.
        </Text>
        <Text style={styles.aboutText}>
          • Data PIN dikunci secara lokal menggunakan SHA-256.{'\n'}
          • Laporan bulanan dapat diekspor kapan saja ke CSV atau JSON (Zero Lock-In).
        </Text>
      </ModalForm>
    </AppFrame>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  headerBlock: {
    gap: 2,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    ...SHADOWS.card,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: RADII.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '800',
  },
  flex1: {
    flex: 1,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingVertical: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  itemSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  badgeValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.terracottaDark,
    backgroundColor: COLORS.terracottaSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADII.pill,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textMuted,
    paddingHorizontal: 4,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 2,
  },
  exportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingTop: 4,
  },
  modalSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.bgCream,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.terracottaDark,
  },
  disablePinWrap: {
    marginTop: SPACING.sm,
  },
  aboutText: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
});
