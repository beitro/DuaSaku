import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useDuaSaku } from '../context/DuaSakuContext';
import { COLORS, RADII, SHADOWS, SPACING } from '../theme/tokens';
import type { TransactionType } from '../types';
import { formatMonthLabel, formatRp, formatSignedRp } from '../utils/format';

export function TransactionsScreen(): React.JSX.Element {
  const {
    selectedMonth,
    transactions,
    couple,
    accounts,
    openEditTransaction,
    openNewTransaction,
    deleteTransaction,
    requestConfirm,
  } = useDuaSaku();

  const [partnerFilter, setPartnerFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (partnerFilter !== 'all' && tx.partnerId !== partnerFilter) return false;
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (accountFilter !== 'all' && (tx.accountId || 'none') !== accountFilter) return false;
      if (q) {
        const hay = `${tx.categoryName} ${tx.note} ${tx.partnerName} ${tx.accountName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, partnerFilter, typeFilter, accountFilter, searchQuery]);

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
      {/* Header & Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.title}>
            Transaksi — {formatMonthLabel(selectedMonth)}
          </Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => openNewTransaction('expense')}
          >
            <Text style={styles.addBtnText}>+ Catat</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.totalsRow}>
          <Text style={styles.incomeText}>Masuk: {formatRp(monthTotals.income)}</Text>
          <Text style={styles.expenseText}>Keluar: {formatRp(monthTotals.expense)}</Text>
        </View>
      </View>

      {/* Search & Filters */}
      <TextInput
        style={styles.searchInput}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Cari catatan, kategori, atau dompet..."
        placeholderTextColor={COLORS.textPlaceholder}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.chip, partnerFilter === 'all' && styles.chipActive]}
          onPress={() => setPartnerFilter('all')}
        >
          <Text style={[styles.chipText, partnerFilter === 'all' && styles.chipTextActive]}>
            Semua Pasangan
          </Text>
        </TouchableOpacity>
        {(couple?.partners || []).map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.chip, partnerFilter === p.id && styles.chipActive]}
            onPress={() => setPartnerFilter(p.id)}
          >
            <Text style={[styles.chipText, partnerFilter === p.id && styles.chipTextActive]}>
              {p.name}
            </Text>
          </TouchableOpacity>
        ))}
        {(['all', 'expense', 'income'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.chip, typeFilter === t && styles.chipActive]}
            onPress={() => setTypeFilter(t)}
          >
            <Text style={[styles.chipText, typeFilter === t && styles.chipTextActive]}>
              {t === 'all' ? 'Semua Tipe' : t === 'income' ? 'Pemasukan' : 'Pengeluaran'}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.chip, accountFilter === 'all' && styles.chipActive]}
          onPress={() => setAccountFilter('all')}
        >
          <Text style={[styles.chipText, accountFilter === 'all' && styles.chipTextActive]}>
            Semua Dompet
          </Text>
        </TouchableOpacity>
        {accounts.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={[styles.chip, accountFilter === a.id && styles.chipActive]}
            onPress={() => setAccountFilter(a.id)}
          >
            <Text style={[styles.chipText, accountFilter === a.id && styles.chipTextActive]}>
              {a.icon} {a.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
              <TouchableOpacity
                style={styles.actionPill}
                onPress={() => openEditTransaction(tx)}
              >
                <Text style={styles.actionPillText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionPill, styles.deletePill]}
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
                <Text style={styles.deletePillText}>Hapus</Text>
              </TouchableOpacity>
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
});
