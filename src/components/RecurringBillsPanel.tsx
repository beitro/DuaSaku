import React, { useState } from 'react';
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
import type { RecurringFrequency, TransactionType } from '../types';
import { formatRp, parseIdrInput, toLocalDateInput } from '../utils/format';

const FREQ_LABEL: Record<RecurringFrequency, string> = {
  weekly: 'Mingguan',
  monthly: 'Bulanan',
  yearly: 'Tahunan',
};

export function RecurringBillsPanel(): React.JSX.Element {
  const {
    recurringRules,
    categories,
    accounts,
    addRecurringRule,
    toggleRecurringRule,
    payRecurringRule,
    deleteRecurringRule,
    requestConfirm,
    showError,
  } = useDuaSaku();
  const { height } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();

  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [nextDueDate, setNextDueDate] = useState(toLocalDateInput(new Date()));
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => {
    setTitle('');
    setType('expense');
    setAmountInput('');
    setCategoryId(categories[0]?.id || '');
    setAccountId(accounts[0]?.id ?? null);
    setFrequency('monthly');
    setNextDueDate(toLocalDateInput(new Date()));
    setModalVisible(true);
  };

  const handleSave = async () => {
    const amount = parseIdrInput(amountInput);
    if (title.trim().length < 2) {
      showError('Nama tagihan minimal 2 karakter.');
      return;
    }
    if (!categoryId) {
      showError('Pilih kategori terlebih dahulu.');
      return;
    }
    if (amount <= 0) {
      showError('Nominal tagihan harus lebih dari 0.');
      return;
    }
    setSubmitting(true);
    try {
      await addRecurringRule({
        title: title.trim(),
        type,
        amount,
        categoryId,
        accountId,
        frequency,
        nextDueDate: nextDueDate.trim() || toLocalDateInput(new Date()),
      });
      setModalVisible(false);
    } catch {
      // handled by context
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View testID="recurring-bills-panel">
      <View style={styles.heroCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.heroKicker}>Tagihan & Transaksi Berulang</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} testID="add-recurring-btn">
            <Text style={styles.addBtnText}>+ Tambah Tagihan</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.heroSub}>
          Catat listrik, internet, cicilan, atau gaji bulanan agar tidak pernah terlewat.
        </Text>
      </View>

      {recurringRules.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.cardTitle}>Belum ada tagihan berulang</Text>
          <Text style={styles.mutedText}>
            Tambahkan tagihan rutin bulanan agar cukup 1 ketuk untuk mencatat pembayarannya.
          </Text>
        </View>
      ) : (
        recurringRules.map((rule) => (
          <View key={rule.id} style={styles.card} testID={`recurring-card-${rule.id}`}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>
                {rule.categoryIcon} {rule.title}
              </Text>
              <Text style={rule.type === 'income' ? styles.incomeAmount : styles.expenseAmount}>
                {formatRp(rule.amount)}
              </Text>
            </View>
            <Text style={styles.metaText}>
              {FREQ_LABEL[rule.frequency]} · Jatuh tempo: {rule.nextDueDate}
              {rule.accountName ? ` · ${rule.accountName}` : ''}
              {!rule.active ? ' · Dijeda' : ''}
            </Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.payBtn}
                onPress={() => payRecurringRule(rule.id)}
                testID={`recurring-pay-${rule.id}`}
              >
                <Text style={styles.payBtnText}>Bayar & Catat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => toggleRecurringRule(rule.id, !rule.active)}
                testID={`recurring-toggle-${rule.id}`}
              >
                <Text style={styles.secondaryBtnText}>{rule.active ? 'Jeda' : 'Aktifkan'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() =>
                  requestConfirm({
                    title: 'Hapus Tagihan Berulang?',
                    message: `Hapus jadwal "${rule.title}" (${formatRp(rule.amount)})?`,
                    confirmLabel: 'Hapus',
                    destructive: true,
                    onConfirm: () => deleteRecurringRule(rule.id),
                  })
                }
                testID={`recurring-delete-${rule.id}`}
              >
                <Text style={styles.deleteBtnText}>Hapus</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        onRequestClose={() => setModalVisible(false)}
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
              styles.modalScroll,
              keyboardHeight > 0 && styles.modalScrollKeyboard,
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
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Tambah Tagihan Berulang</Text>

            <Text style={styles.label}>Nama Tagihan / Jadwal</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Contoh: WiFi Biznet / Listrik PLN"
              placeholderTextColor={COLORS.textPlaceholder}
              testID="recurring-title-input"
            />

            <Text style={styles.label}>Nominal (Rp)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={amountInput}
              onChangeText={setAmountInput}
              placeholder="Contoh: 350000"
              placeholderTextColor={COLORS.textPlaceholder}
              testID="recurring-amount-input"
            />

            <Text style={styles.label}>Frekuensi</Text>
            <View style={styles.rowGap}>
              {(['weekly', 'monthly', 'yearly'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.chip, frequency === f && styles.chipActive]}
                  onPress={() => setFrequency(f)}
                >
                  <Text style={[styles.chipText, frequency === f && styles.chipTextActive]}>
                    {FREQ_LABEL[f]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Kategori</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.chip, categoryId === cat.id && styles.chipActive]}
                  onPress={() => setCategoryId(cat.id)}
                >
                  <Text style={[styles.chipText, categoryId === cat.id && styles.chipTextActive]}>
                    {cat.icon} {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Jatuh Tempo Berikutnya (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={nextDueDate}
              onChangeText={setNextDueDate}
              placeholder="2026-11-25"
              placeholderTextColor={COLORS.textPlaceholder}
            />

            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                disabled={submitting}
                testID="recurring-save-btn"
              >
                {submitting ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.saveBtnText}>Simpan</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: COLORS.heroCocoa,
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.hero,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroKicker: {
    color: COLORS.textOnDark,
    fontSize: 15,
    fontWeight: '800',
  },
  heroSub: {
    color: COLORS.heroSubtle,
    fontSize: 12,
    marginTop: SPACING.xs + 2,
  },
  addBtn: {
    backgroundColor: COLORS.terracottaBtn,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADII.pill,
  },
  addBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  mutedText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.terracottaDark,
  },
  incomeAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.sageDark,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  payBtn: {
    backgroundColor: COLORS.sageBtn,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADII.pill,
  },
  payBtnText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '800',
  },
  secondaryBtn: {
    backgroundColor: COLORS.warmSand,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADII.pill,
  },
  secondaryBtnText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: COLORS.terracottaSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADII.pill,
  },
  deleteBtnText: {
    color: COLORS.terracottaDark,
    fontSize: 12,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.backdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  backdropKeyboard: {
    justifyContent: 'flex-start',
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalScrollKeyboard: {
    justifyContent: 'flex-start',
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.bgCream,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  rowGap: {
    flexDirection: 'row',
    gap: SPACING.xs + 2,
    marginBottom: SPACING.md,
  },
  chip: {
    backgroundColor: COLORS.warmSand,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADII.pill,
    marginRight: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.heroCocoa,
    borderColor: COLORS.heroCocoa,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  chipTextActive: {
    color: COLORS.textOnDark,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelBtnText: {
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: COLORS.terracottaBtn,
    borderRadius: RADII.md,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  saveBtnText: {
    color: COLORS.white,
    fontWeight: '800',
  },
});
