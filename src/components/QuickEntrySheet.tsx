import React, { useEffect, useRef, useState } from 'react';
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
import { COLORS, QUICK_AMOUNT_PRESETS, RADII, SHADOWS, SPACING } from '../theme/tokens';
import type { TransactionType } from '../types';
import {
  formatRp,
  isValidDateInput,
  parseIdrInput,
  shiftDateInput,
  toLocalDateInput,
} from '../utils/format';

export function QuickEntrySheet(): React.JSX.Element | null {
  const {
    quickEntryOpen,
    quickEntry,
    closeQuickEntry,
    categories,
    accounts,
    selectedMonth,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    requestConfirm,
    showError,
  } = useDuaSaku();
  const { height } = useWindowDimensions();

  const [type, setType] = useState<TransactionType>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const prevOpenRef = useRef(false);
  const prevQuickEntryRef = useRef(quickEntry);

  useEffect(() => {
    const justOpened = !prevOpenRef.current && quickEntryOpen;
    const entryChanged = prevQuickEntryRef.current !== quickEntry;
    prevOpenRef.current = quickEntryOpen;
    prevQuickEntryRef.current = quickEntry;

    if (!quickEntryOpen) return;
    if (!justOpened && !entryChanged) {
      if (!categoryId && categories[0]?.id) {
        setCategoryId(categories[0].id);
      }
      return;
    }

    setFormError(null);
    if (quickEntry.mode === 'edit' && quickEntry.editingTx) {
      const tx = quickEntry.editingTx;
      setType(tx.type);
      setAmountInput(String(Math.round(tx.amount)));
      setCategoryId(tx.categoryId);
      setAccountId(tx.accountId ?? null);
      setNote(tx.note || '');
      setDateInput(toLocalDateInput(tx.occurredAt));
    } else {
      setType(quickEntry.defaultType);
      setAmountInput(quickEntry.presetAmount ? String(quickEntry.presetAmount) : '');
      setCategoryId(quickEntry.presetCategoryId || categories[0]?.id || '');
      setAccountId(accounts[0]?.id ?? null);
      setNote('');
      const today = toLocalDateInput(new Date());
      setDateInput(today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`);
    }
  }, [quickEntryOpen, quickEntry, categories, accounts, selectedMonth, categoryId]);

  if (!quickEntryOpen) return null;

  const parsedAmount = parseIdrInput(amountInput);

  const handleSave = async () => {
    setFormError(null);
    if (!categoryId) {
      const msg = 'Pilih kategori terlebih dahulu.';
      setFormError(msg);
      showError(msg);
      return;
    }
    if (parsedAmount <= 0) {
      const msg = 'Masukkan nominal transaksi lebih dari 0.';
      setFormError(msg);
      showError(msg);
      return;
    }
    const trimmedDate = dateInput.trim();
    if (!isValidDateInput(trimmedDate)) {
      const msg = 'Format tanggal harus YYYY-MM-DD (contoh: 2026-11-22).';
      setFormError(msg);
      showError(msg);
      return;
    }
    const occurredAt = new Date(`${trimmedDate}T12:00:00`).toISOString();

    setSubmitting(true);
    try {
      if (quickEntry.mode === 'edit' && quickEntry.editingTx) {
        await updateTransaction(quickEntry.editingTx.id, {
          categoryId,
          type,
          amount: parsedAmount,
          note: note.trim(),
          occurredAt,
          accountId,
        });
      } else {
        await createTransaction({
          categoryId,
          type,
          amount: parsedAmount,
          note: note.trim(),
          occurredAt,
          accountId,
        });
      }
      closeQuickEntry();
    } catch {
      // Context displays feedback banner
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    const target = quickEntry.editingTx;
    if (!target) return;
    requestConfirm({
      title: 'Hapus Transaksi?',
      message: `Hapus ${target.categoryName} senilai ${formatRp(target.amount)}? Saldo dompet terkait akan otomatis disesuaikan.`,
      confirmLabel: 'Hapus',
      destructive: true,
      onConfirm: async () => {
        await deleteTransaction(target.id);
        closeQuickEntry();
      },
    });
  };

  return (
    <Modal
      visible={quickEntryOpen}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      onRequestClose={closeQuickEntry}
      testID="quick-entry-modal"
    >
      <View
        style={[
          styles.backdrop,
          Platform.OS === 'web' ? { minHeight: height } : undefined,
        ]}
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {quickEntry.mode === 'edit' ? 'Edit Transaksi' : 'Catat Transaksi Cepat'}
            </Text>
            <TouchableOpacity onPress={closeQuickEntry} testID="quick-entry-close-btn">
              <Text style={styles.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.72 }}>
            {/* Type Toggle */}
            <View style={styles.segmentRow}>
              <TouchableOpacity
                style={[styles.segmentBtn, type === 'expense' && styles.segmentExpenseActive]}
                onPress={() => setType('expense')}
                testID="quick-entry-type-expense"
              >
                <Text style={[styles.segmentText, type === 'expense' && styles.segmentTextActive]}>
                  - Pengeluaran
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, type === 'income' && styles.segmentIncomeActive]}
                onPress={() => setType('income')}
                testID="quick-entry-type-income"
              >
                <Text style={[styles.segmentText, type === 'income' && styles.segmentTextActive]}>
                  + Pemasukan
                </Text>
              </TouchableOpacity>
            </View>

            {/* Amount & Presets */}
            <Text style={styles.label}>Nominal (Rp)</Text>
            <TextInput
              style={styles.amountInput}
              keyboardType="numeric"
              value={amountInput}
              onChangeText={setAmountInput}
              placeholder="Contoh: 500000"
              placeholderTextColor={COLORS.textPlaceholder}
              testID="quick-entry-amount-input"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetRow}>
              {QUICK_AMOUNT_PRESETS.map((p) => {
                const selected = parsedAmount === p.amount;
                return (
                  <TouchableOpacity
                    key={p.label}
                    style={[styles.presetChip, selected && styles.presetChipActive]}
                    onPress={() => setAmountInput(String(p.amount))}
                    testID={`quick-preset-${p.amount}`}
                  >
                    <Text style={[styles.presetText, selected && styles.presetTextActive]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Category */}
            <Text style={styles.label}>Kategori / Pos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {categories.map((cat) => {
                const selected = categoryId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.chip, selected && styles.chipActive]}
                    onPress={() => setCategoryId(cat.id)}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                      {cat.icon} {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Account / Wallet */}
            <Text style={styles.label}>Dompet / Rekening</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              <TouchableOpacity
                style={[styles.chip, accountId === null && styles.chipActive]}
                onPress={() => setAccountId(null)}
              >
                <Text style={[styles.chipText, accountId === null && styles.chipTextActive]}>
                  Tanpa Dompet
                </Text>
              </TouchableOpacity>
              {accounts.map((acc) => {
                const selected = accountId === acc.id;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.chip, selected && styles.chipActive]}
                    onPress={() => setAccountId(acc.id)}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                      {acc.icon} {acc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Date & Note */}
            <Text style={styles.label}>Tanggal (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={dateInput}
              onChangeText={setDateInput}
              placeholder="2026-11-22"
              placeholderTextColor={COLORS.textPlaceholder}
              testID="quick-entry-date-input"
            />
            <View style={styles.dateQuickRow}>
              <TouchableOpacity
                style={styles.dateQuickChip}
                onPress={() => setDateInput(toLocalDateInput(new Date()))}
                testID="quick-date-today"
              >
                <Text style={styles.dateQuickText}>Hari Ini</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateQuickChip}
                onPress={() => setDateInput(shiftDateInput(toLocalDateInput(new Date()), -1))}
                testID="quick-date-yesterday"
              >
                <Text style={styles.dateQuickText}>Kemarin</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Catatan</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="Contoh: Makan malam berdua / DP Catering"
              placeholderTextColor={COLORS.textPlaceholder}
              testID="quick-entry-note-input"
            />

            {!!formError && (
              <View style={styles.inlineErrorBox}>
                <Text style={styles.inlineErrorText}>{formError}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footerRow}>
            {quickEntry.mode === 'edit' && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={submitting}>
                <Text style={styles.deleteBtnText}>Hapus</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={closeQuickEntry}
              disabled={submitting}
              testID="quick-entry-cancel-btn"
            >
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, type === 'income' ? styles.saveIncome : styles.saveExpense]}
              onPress={handleSave}
              disabled={submitting}
              testID="quick-entry-save-btn"
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.saveBtnText}>Simpan</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.backdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.elevated,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  closeX: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMuted,
    padding: 4,
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.warmSand,
    borderRadius: RADII.md,
    padding: 4,
    marginBottom: SPACING.md,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: RADII.sm,
  },
  segmentExpenseActive: {
    backgroundColor: COLORS.terracottaBtn,
  },
  segmentIncomeActive: {
    backgroundColor: COLORS.sageBtn,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  segmentTextActive: {
    color: COLORS.white,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  amountInput: {
    backgroundColor: COLORS.bgCream,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  presetRow: {
    marginBottom: SPACING.md,
  },
  presetChip: {
    backgroundColor: COLORS.warmSand,
    borderRadius: RADII.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  presetChipActive: {
    backgroundColor: COLORS.heroCocoa,
    borderColor: COLORS.heroCocoa,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  presetTextActive: {
    color: COLORS.textOnDark,
  },
  chipScroll: {
    marginBottom: SPACING.md,
  },
  chip: {
    backgroundColor: COLORS.warmSand,
    borderRadius: RADII.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
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
  input: {
    backgroundColor: COLORS.bgCream,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  dateQuickRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
  },
  dateQuickChip: {
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateQuickText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
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
  footerRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  cancelBtn: {
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  deleteBtn: {
    backgroundColor: COLORS.terracottaSoft,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: COLORS.terracottaDark,
    fontWeight: '800',
    fontSize: 13,
  },
  saveBtn: {
    flex: 1,
    borderRadius: RADII.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveExpense: {
    backgroundColor: COLORS.terracottaBtn,
  },
  saveIncome: {
    backgroundColor: COLORS.sageBtn,
  },
  saveBtnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 14,
  },
});
