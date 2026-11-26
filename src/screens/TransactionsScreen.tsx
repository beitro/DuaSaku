import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useDuaSaku } from '../context/DuaSakuContext';
import { COLORS, RADII, SHADOWS, SPACING } from '../theme/tokens';
import type { TransactionType } from '../types';
import { formatMonthLabel, formatRp, formatSignedRp, parseIdrInput } from '../utils/format';
import { DashboardHero, HeroStatRow } from '../components/DashboardHero';
import { PressableButton } from '../components/PressableButton';
import { ChipGroup } from '../components/ChipGroup';

export function TransactionsScreen(): React.JSX.Element {
  const {
    selectedMonth,
    transactions,
    couple,
    categories,
    accounts,
    openEditTransaction,
    openNewTransaction,
    deleteTransaction,
    requestConfirm,
  } = useDuaSaku();

  const [partnerFilter, setPartnerFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [minAmountInput, setMinAmountInput] = useState('');
  const [maxAmountInput, setMaxAmountInput] = useState('');
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const minAmt = minAmountInput.trim() ? parseIdrInput(minAmountInput) : 0;
    const maxAmt = maxAmountInput.trim() ? parseIdrInput(maxAmountInput) : 0;
    return transactions.filter((tx) => {
      if (partnerFilter !== 'all' && tx.partnerId !== partnerFilter) return false;
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (accountFilter !== 'all' && (tx.accountId || 'none') !== accountFilter) return false;
      if (categoryFilter !== 'all' && tx.categoryId !== categoryFilter) return false;
      if (minAmt > 0 && tx.amount < minAmt) return false;
      if (maxAmt > 0 && tx.amount > maxAmt) return false;
      if (q) {
        const hay = `${tx.categoryName} ${tx.note} ${tx.partnerName} ${tx.accountName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, partnerFilter, typeFilter, accountFilter, categoryFilter, minAmountInput, maxAmountInput, searchQuery]);

  const monthTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filtered) {
      if (tx.type === 'income') income += tx.amount;
      else expense += tx.amount;
    }
    return { income, expense };
  }, [filtered]);

  return (
    <View style={styles.container} testID="transactions-screen">
      {/* Header & Summary — DashboardHero */}
      <DashboardHero
        kicker={`Transaksi — ${formatMonthLabel(selectedMonth)}`}
        subtitle={
          <HeroStatRow
            items={[
              { label: 'Masuk', value: formatRp(monthTotals.income), tone: 'income' },
              { label: 'Keluar', value: formatRp(monthTotals.expense), tone: 'expense' },
            ]}
          />
        }
        primaryActions={[
          {
            label: '+ Catat',
            onPress: () => openNewTransaction('expense'),
            variant: 'primary',
            size: 'sm',
          },
        ]}
        padding="lg"
        testID="transactions-hero"
      />

      {/* Search & Filters */}
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.searchInput, { flex: 1, marginBottom: 0 }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Cari transaksi, kategori, atau dompet..."
          placeholderTextColor={COLORS.textPlaceholder}
          testID="transactions-search-input"
        />
        <PressableButton
          variant="ghost"
          size="sm"
          style={[styles.advToggleBtn, showAdvancedFilter && styles.advToggleBtnActive].flat() as any}
          onPress={() => setShowAdvancedFilter((v) => !v)}
          testID="transactions-adv-filter-btn"
        >
          <Text style={[styles.advToggleText, showAdvancedFilter && styles.advToggleTextActive].flat() as any}>
            Filter
          </Text>
        </PressableButton>
      </View>

      {showAdvancedFilter && (
        <View style={styles.advPanel} testID="transactions-adv-panel">
          <Text style={styles.advLabel}>Kategori</Text>
          <ChipGroup<string>
            options={[
              { value: 'all', label: 'Semua Kategori' },
              ...categories.map((c) => ({
                value: c.id,
                label: `${c.icon} ${c.name}`,
              })),
            ]}
            selected={categoryFilter}
            onSelect={setCategoryFilter}
            layout="scroll"
            testID="transactions-category-filter"
          />
          <Text style={styles.advLabel}>Rentang Nominal (Rp)</Text>
          <View style={styles.rangeRow}>
            <TextInput
              style={[styles.searchInput, styles.rangeInput]}
              keyboardType="numeric"
              value={minAmountInput}
              onChangeText={setMinAmountInput}
              placeholder="Min (cth: 50000)"
              placeholderTextColor={COLORS.textPlaceholder}
              testID="transactions-min-amount"
            />
            <TextInput
              style={[styles.searchInput, styles.rangeInput]}
              keyboardType="numeric"
              value={maxAmountInput}
              onChangeText={setMaxAmountInput}
              placeholder="Maks (cth: 500000)"
              placeholderTextColor={COLORS.textPlaceholder}
              testID="transactions-max-amount"
            />
          </View>
        </View>
      )}

      <View style={styles.filterRow}>
        <ChipGroup<string>
          options={[
            { value: 'all', label: 'Semua Pasangan' },
            ...(couple?.partners || []).map((p) => ({
              value: p.id,
              label: p.name,
            })),
          ]}
          selected={partnerFilter}
          onSelect={setPartnerFilter}
          layout="scroll"
          testID="transactions-partner-filter"
        />
        <ChipGroup<'all' | TransactionType>
          options={[
            { value: 'all', label: 'Semua Tipe' },
            { value: 'expense', label: 'Pengeluaran' },
            { value: 'income', label: 'Pemasukan' },
          ]}
          selected={typeFilter}
          onSelect={setTypeFilter}
          layout="scroll"
          testID="transactions-type-filter"
        />
        <ChipGroup<string>
          options={[
            { value: 'all', label: 'Semua Dompet' },
            ...accounts.map((a) => ({
              value: a.id,
              label: `${a.icon} ${a.name}`,
            })),
          ]}
          selected={accountFilter}
          onSelect={setAccountFilter}
          layout="scroll"
          testID="transactions-account-filter"
        />
      </View>

      {/* Transaction List */}
      {filtered.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Belum ada transaksi pada filter ini</Text>
          <Text style={styles.emptySub}>
            Gunakan tombol "+ Catat" atau shortcut cepat untuk mencatat transaksi bulan ini.
          </Text>
        </View>
      ) : (
        filtered.map((tx) => (
          <View key={tx.id} style={styles.txCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.txTitle}>
                {tx.categoryIcon} {tx.categoryName}
              </Text>
              <Text style={tx.type === 'income' ? styles.incomeText : styles.expenseText}>
                {formatSignedRp(tx.amount, tx.type)}
              </Text>
            </View>
            <Text style={styles.txMeta}>
              {tx.partnerName}
              {tx.accountName ? ` · ${tx.accountIcon || '👛'} ${tx.accountName}` : ''} ·{' '}
              {new Date(tx.occurredAt).toLocaleDateString('id-ID')}
            </Text>
            {!!tx.note && <Text style={styles.txNote}>{tx.note}</Text>}
            <View style={styles.txActions}>
              <PressableButton
                variant="ghost"
                size="sm"
                onPress={() => openNewTransaction(tx.type, tx.amount, tx.categoryId)}
                testID={`tx-duplicate-${tx.id}`}
              >
                <Text style={styles.actionPillText}>Catat Lagi</Text>
              </PressableButton>
              <PressableButton
                variant="ghost"
                size="sm"
                onPress={() => openEditTransaction(tx)}
              >
                <Text style={styles.actionPillText}>Edit</Text>
              </PressableButton>
              <PressableButton
                variant="ghost"
                size="sm"
                style={styles.deletePill}
                onPress={() =>
                  requestConfirm({
                    title: 'Hapus Transaksi?',
                    message: `Hapus transaksi ${tx.categoryName} (${formatRp(tx.amount)})?`,
                    confirmLabel: 'Hapus',
                    destructive: true,
                    onConfirm: () => deleteTransaction(tx.id),
                  })
                }
              >
                <Text style={[styles.deletePillText].flat() as any}>Hapus</Text>
              </PressableButton>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
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
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  incomeText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.sageDark,
  },
  expenseText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  filterRow: {
    marginBottom: SPACING.md,
  },
  chip: {
    backgroundColor: COLORS.warmSand,
    borderRadius: RADII.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
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
  txCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  txMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  txNote: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  txActions: {
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
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
    marginBottom: SPACING.sm,
  },
  advToggleBtn: {
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  advToggleBtnActive: {
    backgroundColor: COLORS.heroCocoa,
    borderColor: COLORS.heroCocoa,
  },
  advToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  advToggleTextActive: {
    color: COLORS.white,
  },
  advPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  advLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  rangeInput: {
    flex: 1,
    marginBottom: 0,
  },
});
