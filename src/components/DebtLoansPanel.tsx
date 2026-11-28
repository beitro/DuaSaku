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
import type { DebtDirection } from '../types';
import { formatRp, parseIdrInput } from '../utils/format';

export function DebtLoansPanel(): React.JSX.Element {
  const {
    debtLoans,
    addDebtLoan,
    settleDebtLoan,
    deleteDebtLoan,
    requestConfirm,
    showError,
  } = useDuaSaku();
  const { height } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();

  const [modalVisible, setModalVisible] = useState(false);
  const [personName, setPersonName] = useState('');
  const [direction, setDirection] = useState<DebtDirection>('receivable');
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => {
    setPersonName('');
    setDirection('receivable');
    setAmountInput('');
    setNote('');
    setModalVisible(true);
  };

  const handleSave = async () => {
    const amount = parseIdrInput(amountInput);
    if (personName.trim().length < 2) {
      showError('Nama pihak / teman minimal 2 karakter.');
      return;
    }
    if (amount <= 0) {
      showError('Nominal harus lebih dari 0.');
      return;
    }
    setSubmitting(true);
    try {
      await addDebtLoan({
        personName: personName.trim(),
        direction,
        amount,
        note: note.trim(),
      });
      setModalVisible(false);
    } catch {
      // handled by context
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View testID="debt-loans-panel">
      <View style={styles.heroCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.heroTitle}>Hutang, Piutang & Patungan</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} testID="add-debt-btn">
            <Text style={styles.addBtnText}>+ Catat</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.heroSub}>
          Pantau siapa yang masih perlu bayar patungan atau cicilan yang harus dilunasi.
        </Text>
      </View>

      {debtLoans.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.cardTitle}>Belum ada catatan hutang/piutang</Text>
          <Text style={styles.mutedText}>
            Catat patungan makan atau pinjaman agar pelunasannya tercatat rapi.
          </Text>
        </View>
      ) : (
        debtLoans.map((item) => {
          const pct = item.amount > 0 ? Math.min(100, Math.round((item.paidAmount / item.amount) * 100)) : 0;
          return (
            <View key={item.id} style={styles.card} testID={`debt-card-${item.id}`}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>
                  {item.direction === 'receivable' ? '🤝 Piutang · ' : '💸 Hutang · '}
                  {item.personName}
                </Text>
                <Text style={item.direction === 'receivable' ? styles.receivableAmt : styles.payableAmt}>
                  {formatRp(item.amount)}
                </Text>
              </View>
              {!!item.note && <Text style={styles.noteText}>{item.note}</Text>}
              <Text style={styles.metaText}>
                Terbayar {formatRp(item.paidAmount)} ({pct}%) · Sisa {formatRp(item.remainingAmount)}
                {item.settled ? ' · LUNAS ✓' : ''}
              </Text>
              <View style={styles.actionsRow}>
                {!item.settled && (
                  <TouchableOpacity
                    style={styles.settleBtn}
                    onPress={() => settleDebtLoan(item.id)}
                    testID={`debt-settle-${item.id}`}
                  >
                    <Text style={styles.settleBtnText}>Lunasi</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() =>
                    requestConfirm({
                      title: 'Hapus Catatan?',
                      message: `Hapus catatan ${item.personName} (${formatRp(item.amount)})?`,
                      confirmLabel: 'Hapus',
                      destructive: true,
                      onConfirm: () => deleteDebtLoan(item.id),
                    })
                  }
                  testID={`debt-delete-${item.id}`}
                >
                  <Text style={styles.deleteBtnText}>Hapus</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
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
            <Text style={styles.modalTitle}>Catat Hutang / Patungan</Text>

            <View style={styles.rowGap}>
              <TouchableOpacity
                style={[styles.chip, direction === 'receivable' && styles.chipActive]}
                onPress={() => setDirection('receivable')}
              >
                <Text style={[styles.chipText, direction === 'receivable' && styles.chipTextActive]}>
                  Piutang (Ditagih)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, direction === 'payable' && styles.chipActive]}
                onPress={() => setDirection('payable')}
              >
                <Text style={[styles.chipText, direction === 'payable' && styles.chipTextActive]}>
                  Hutang (Kita Bayar)
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Nama Orang / Pihak</Text>
            <TextInput
              style={styles.input}
              value={personName}
              onChangeText={setPersonName}
              placeholder="Contoh: Bima / Patungan Makan"
              placeholderTextColor={COLORS.textPlaceholder}
              testID="debt-person-input"
            />

            <Text style={styles.label}>Nominal (Rp)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={amountInput}
              onChangeText={setAmountInput}
              placeholder="Contoh: 150000"
              placeholderTextColor={COLORS.textPlaceholder}
              testID="debt-amount-input"
            />

            <Text style={styles.label}>Catatan (Opsional)</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="Contoh: Split bill makan malam"
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
                testID="debt-save-btn"
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
  heroTitle: {
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
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  mutedText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  receivableAmt: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.sageDark,
  },
  payableAmt: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.terracottaDark,
  },
  noteText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  settleBtn: {
    backgroundColor: COLORS.sageBtn,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADII.pill,
  },
  settleBtnText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '800',
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
