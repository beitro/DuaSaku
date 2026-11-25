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
import {
  ACCOUNT_COLOR_PRESETS,
  ACCOUNT_TYPE_ICONS,
  ACCOUNT_TYPE_LABELS,
  COLORS,
  RADII,
  SHADOWS,
  SPACING,
} from '../theme/tokens';
import type { AccountType, CoupleAccount } from '../types';
import {
  dateInputToIso,
  formatRp,
  formatShortDateId,
  getDefaultDateInputForMonth,
  isValidDateInput,
  parseIdrInput,
} from '../utils/format';

const ACCOUNT_TYPES: AccountType[] = ['cash', 'bank', 'ewallet', 'shared_savings', 'other'];

export function AccountsScreen(): React.JSX.Element {
  const {
    accounts,
    accountTotals,
    transfers,
    selectedMonth,
    me,
    createAccount,
    updateAccount,
    deleteAccount,
    transferAccounts,
    requestConfirm,
    showError,
  } = useDuaSaku();
  const { height } = useWindowDimensions();

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<CoupleAccount | null>(null);
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('bank');
  const [isShared, setIsShared] = useState(true);
  const [initialBalance, setInitialBalance] = useState('');
  const [color, setColor] = useState<string>(ACCOUNT_COLOR_PRESETS[0]);
  const [submitting, setSubmitting] = useState(false);

  // Transfer modal state
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setAccountType('bank');
    setIsShared(true);
    setInitialBalance('0');
    setColor(ACCOUNT_COLOR_PRESETS[0]);
    setModalVisible(true);
  };

  const openEdit = (acc: CoupleAccount) => {
    setEditing(acc);
    setName(acc.name);
    setAccountType(acc.accountType);
    setIsShared(acc.isShared);
    setInitialBalance(String(Math.round(acc.initialBalance)));
    setColor(acc.color || ACCOUNT_COLOR_PRESETS[0]);
    setModalVisible(true);
  };

  const openTransfer = () => {
    if (accounts.length < 2) {
      showError('Tambahkan minimal 2 dompet untuk melakukan transfer.');
      return;
    }
    setFromAccountId(accounts[0].id);
    setToAccountId(accounts[1].id);
    setTransferAmount('');
    setTransferDate(getDefaultDateInputForMonth(selectedMonth));
    setTransferNote('');
    setTransferError(null);
    setTransferModalVisible(true);
  };

  const handleSave = async () => {
    if (name.trim().length < 2) {
      showError('Nama dompet minimal 2 karakter.');
      return;
    }
    const parsedBal = parseIdrInput(initialBalance);
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        accountType,
        isShared,
        ownerPartnerId: isShared ? null : me?.id ?? null,
        initialBalance: parsedBal,
        icon: ACCOUNT_TYPE_ICONS[accountType],
        color,
      };
      if (editing) {
        await updateAccount(editing.id, payload);
      } else {
        await createAccount(payload);
      }
      setModalVisible(false);
    } catch {
      // handled by context
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransferSubmit = async () => {
    setTransferError(null);
    if (!fromAccountId || !toAccountId) {
      setTransferError('Pilih dompet asal dan tujuan.');
      return;
    }
    if (fromAccountId === toAccountId) {
      setTransferError('Dompet asal dan tujuan tidak boleh sama.');
      return;
    }
    const parsedAmt = parseIdrInput(transferAmount);
    if (parsedAmt <= 0) {
      setTransferError('Nominal transfer harus lebih dari 0.');
      return;
    }
    const fromAcc = accounts.find((a) => a.id === fromAccountId);
    if (fromAcc && fromAcc.balance < parsedAmt) {
      setTransferError('Saldo dompet asal tidak mencukupi.');
      return;
    }
    const trimmedDate = transferDate.trim();
    if (!isValidDateInput(trimmedDate)) {
      setTransferError('Format tanggal harus YYYY-MM-DD.');
      return;
    }

    setTransferring(true);
    try {
      await transferAccounts({
        fromAccountId,
        toAccountId,
        amount: parsedAmt,
        note: transferNote.trim(),
        occurredAt: dateInputToIso(trimmedDate),
      });
      setTransferModalVisible(false);
    } catch {
      // handled by context FeedbackBanner
    } finally {
      setTransferring(false);
    }
  };

  return (
    <View style={styles.container} testID="accounts-screen">
      {/* Totals Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroKicker}>Total Saldo Semua Dompet</Text>
          <View style={styles.heroBtnGroup}>
            <TouchableOpacity
              style={styles.transferBtn}
              onPress={openTransfer}
              accessibilityRole="button"
              testID="transfer-account-btn"
            >
              <Text style={styles.transferBtnText}>⇄ Transfer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={openCreate}
              accessibilityRole="button"
              testID="add-account-btn"
            >
              <Text style={styles.addBtnText}>+ Dompet</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.heroAmount}>{formatRp(accountTotals.totalBalance)}</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.heroSub}>Bersama: {formatRp(accountTotals.sharedBalance)}</Text>
          <Text style={styles.heroSub}>Pribadi: {formatRp(accountTotals.personalBalance)}</Text>
        </View>
      </View>

      {/* Accounts List */}
      {accounts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.cardTitle}>Belum ada dompet atau rekening</Text>
          <Text style={styles.mutedText}>
            Tambahkan Cash, Rekening Bank, E-Wallet, atau Tabungan Bersama agar saldo terhitung otomatis.
          </Text>
        </View>
      ) : (
        accounts.map((acc) => (
          <View key={acc.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>
                {acc.icon} {acc.name}
              </Text>
              <Text style={styles.balanceText}>{formatRp(acc.balance)}</Text>
            </View>
            <Text style={styles.mutedText}>
              {ACCOUNT_TYPE_LABELS[acc.accountType]} ·{' '}
              {acc.isShared ? 'Dompet Bersama' : `Pribadi (${acc.ownerPartnerName || 'Pasangan'})`} · Saldo awal{' '}
              {formatRp(acc.initialBalance)}
            </Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionPill} onPress={() => openEdit(acc)}>
                <Text style={styles.actionPillText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionPill, styles.deletePill]}
                onPress={() =>
                  requestConfirm({
                    title: 'Hapus Dompet?',
                    message: `Hapus dompet "${acc.name}"? Transaksi lama tetap tersimpan tanpa dompet.`,
                    confirmLabel: 'Hapus',
                    destructive: true,
                    onConfirm: () => deleteAccount(acc.id),
                  })
                }
              >
                <Text style={styles.deletePillText}>Hapus</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Recent Transfers */}
      {transfers.length > 0 && (
        <View style={styles.transferSection} testID="transfers-section">
          <Text style={styles.sectionTitle}>Riwayat Transfer Dompet</Text>
          {transfers.map((tr) => (
            <View key={tr.id} style={styles.card} testID={`transfer-card-${tr.id}`}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>
                  {tr.fromAccountIcon || '💳'} {tr.fromAccountName || 'Dompet dihapus'} →{' '}
                  {tr.toAccountIcon || '💳'} {tr.toAccountName || 'Dompet dihapus'}
                </Text>
                <Text style={styles.transferAmountText}>{formatRp(tr.amount)}</Text>
              </View>
              <Text style={styles.mutedText}>
                Oleh {tr.partnerName} · {formatShortDateId(tr.occurredAt)}
                {tr.note ? ` · ${tr.note}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Modal Create / Edit Account */}
      <Modal
        visible={modalVisible}
        transparent
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.backdrop, Platform.OS === 'web' ? { minHeight: height } : undefined]}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {editing ? 'Edit Dompet' : 'Tambah Dompet / Rekening'}
              </Text>

              <Text style={styles.label}>Nama Dompet</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Contoh: BCA Bersama / GoPay"
                placeholderTextColor={COLORS.textPlaceholder}
              />

              <Text style={styles.label}>Jenis</Text>
              <View style={styles.chipWrap}>
                {ACCOUNT_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, accountType === t && styles.chipActive]}
                    onPress={() => setAccountType(t)}
                  >
                    <Text style={[styles.chipText, accountType === t && styles.chipTextActive]}>
                      {ACCOUNT_TYPE_ICONS[t]} {ACCOUNT_TYPE_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Kepemilikan</Text>
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  style={[styles.segmentBtn, isShared && styles.segmentActive]}
                  onPress={() => setIsShared(true)}
                >
                  <Text style={[styles.segmentText, isShared && styles.segmentTextActive]}>
                    Dompet Bersama
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, !isShared && styles.segmentActive]}
                  onPress={() => setIsShared(false)}
                >
                  <Text style={[styles.segmentText, !isShared && styles.segmentTextActive]}>
                    Pribadi ({me?.name})
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Saldo Awal (Rp)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={initialBalance}
                onChangeText={setInitialBalance}
                placeholder="0"
                placeholderTextColor={COLORS.textPlaceholder}
              />

              <View style={styles.footerRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={submitting}>
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

      {/* Modal Wallet-to-Wallet Transfer */}
      <Modal
        visible={transferModalVisible}
        transparent
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        onRequestClose={() => {
          if (!transferring) setTransferModalVisible(false);
        }}
        testID="transfer-modal"
      >
        <View style={[styles.backdrop, Platform.OS === 'web' ? { minHeight: height } : undefined]}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Transfer Antar Dompet</Text>

              <Text style={styles.label}>Dari Dompet</Text>
              <View style={styles.chipWrap}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={`from-${acc.id}`}
                    style={[styles.chip, fromAccountId === acc.id && styles.chipActive]}
                    onPress={() => {
                      setFromAccountId(acc.id);
                      if (transferError) setTransferError(null);
                    }}
                    testID={`transfer-from-${acc.id}`}
                  >
                    <Text style={[styles.chipText, fromAccountId === acc.id && styles.chipTextActive]}>
                      {acc.icon} {acc.name} ({formatRp(acc.balance)})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Ke Dompet</Text>
              <View style={styles.chipWrap}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={`to-${acc.id}`}
                    style={[styles.chip, toAccountId === acc.id && styles.chipActive]}
                    onPress={() => {
                      setToAccountId(acc.id);
                      if (transferError) setTransferError(null);
                    }}
                    testID={`transfer-to-${acc.id}`}
                  >
                    <Text style={[styles.chipText, toAccountId === acc.id && styles.chipTextActive]}>
                      {acc.icon} {acc.name} ({formatRp(acc.balance)})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Nominal Transfer (Rp)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={transferAmount}
                onChangeText={(txt) => {
                  setTransferAmount(txt);
                  if (transferError) setTransferError(null);
                }}
                placeholder="Contoh: 250000"
                placeholderTextColor={COLORS.textPlaceholder}
                testID="transfer-amount-input"
              />

              <Text style={styles.label}>Tanggal (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={transferDate}
                onChangeText={(txt) => {
                  setTransferDate(txt);
                  if (transferError) setTransferError(null);
                }}
                placeholder="2026-11-24"
                placeholderTextColor={COLORS.textPlaceholder}
                testID="transfer-date-input"
              />

              <Text style={styles.label}>Catatan (Opsional)</Text>
              <TextInput
                style={styles.input}
                value={transferNote}
                onChangeText={setTransferNote}
                placeholder="Contoh: Topup tabungan bersama"
                placeholderTextColor={COLORS.textPlaceholder}
                testID="transfer-note-input"
              />

              {!!transferError && (
                <View style={styles.inlineErrorBox}>
                  <Text style={styles.inlineErrorText}>{transferError}</Text>
                </View>
              )}

              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setTransferModalVisible(false)}
                  disabled={transferring}
                  testID="transfer-cancel-btn"
                >
                  <Text style={styles.cancelBtnText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleTransferSubmit}
                  disabled={transferring}
                  testID="transfer-save-btn"
                >
                  {transferring ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.saveBtnText}>Kirim Transfer</Text>
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
  container: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  heroCard: {
    backgroundColor: COLORS.heroCocoa,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.hero,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  heroBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
  },
  transferBtn: {
    backgroundColor: COLORS.terracottaBtn,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADII.pill,
  },
  transferBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
  },
  heroKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heroSubtle,
  },
  heroAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textOnDark,
    marginVertical: 6,
  },
  heroSub: {
    fontSize: 12,
    color: COLORS.heroSubtle,
  },
  addBtn: {
    backgroundColor: COLORS.sageBtn,
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
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  balanceText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.sageDark,
  },
  mutedText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  actionPill: {
    backgroundColor: COLORS.warmSand,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADII.pill,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  deletePill: {
    backgroundColor: COLORS.terracottaSoft,
  },
  deletePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.backdrop,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.elevated,
  },
  transferSection: {
    marginTop: SPACING.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  transferAmountText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.terracottaDark,
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
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACING.md,
  },
  chip: {
    backgroundColor: COLORS.warmSand,
    borderRadius: RADII.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.heroCocoa,
    borderColor: COLORS.heroCocoa,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  chipTextActive: {
    color: COLORS.textOnDark,
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
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: RADII.sm,
  },
  segmentActive: {
    backgroundColor: COLORS.surface,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  segmentTextActive: {
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cancelBtnText: {
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: COLORS.sageBtn,
    borderRadius: RADII.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  saveBtnText: {
    color: COLORS.white,
    fontWeight: '800',
  },
});
