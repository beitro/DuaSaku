import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDuaSaku } from '../context/DuaSakuContext';
import { COLORS, QUICK_AMOUNT_PRESETS, RADII, SHADOWS, SPACING } from '../theme/tokens';
import { formatMonthLabel, formatRp } from '../utils/format';

export function DashboardScreen(): React.JSX.Element {
  const {
    selectedMonth,
    summary,
    accountTotals,
    budgetTotals,
    transactions,
    openNewTransaction,
    setActiveTab,
  } = useDuaSaku();

  const budgetPct =
    budgetTotals.totalLimit > 0
      ? Math.min(100, Math.round((budgetTotals.totalSpent / budgetTotals.totalLimit) * 100))
      : 0;

  return (
    <View style={styles.container} testID="dashboard-screen">
      {/* Hero Balance Card */}
      <View style={styles.heroCard}>
        <Text style={styles.heroKicker}>
          Saldo Bersih — {formatMonthLabel(selectedMonth)}
        </Text>
        <Text style={styles.heroAmount}>
          {formatRp(summary?.netBalance ?? 0)}
        </Text>
        <View style={styles.heroRow}>
          <View style={styles.heroStat}>
            <Text style={styles.heroLabel}>Pemasukan</Text>
            <Text style={styles.heroIncome}>
              {formatRp(summary?.totalIncome ?? 0)}
            </Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroLabel}>Pengeluaran</Text>
            <Text style={styles.heroExpense}>
              {formatRp(summary?.totalExpense ?? 0)}
            </Text>
          </View>
        </View>
      </View>

      {/* Money-Tracker Quick Shortcuts */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Shortcut Catat Cepat</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.expenseBtn}
            onPress={() => openNewTransaction('expense')}
            testID="stub-quick-expense-btn"
          >
            <Text style={styles.btnText}>- Pengeluaran</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.incomeBtn}
            onPress={() => openNewTransaction('income')}
            testID="stub-quick-income-btn"
          >
            <Text style={styles.btnText}>+ Pemasukan</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.presetLabel}>Input Nominal Instan (Pengeluaran)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetRow}>
          {QUICK_AMOUNT_PRESETS.map((p) => (
            <TouchableOpacity
              key={p.label}
              style={styles.presetChip}
              onPress={() => openNewTransaction('expense', p.amount)}
              testID={`dash-preset-${p.amount}`}
            >
              <Text style={styles.presetChipText}>- {p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.linksRow}>
          <TouchableOpacity style={styles.linkPill} onPress={() => setActiveTab('categories')}>
            <Text style={styles.linkText}>Pos & Target</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkPill} onPress={() => setActiveTab('notes')}>
            <Text style={styles.linkText}>Catatan Bersama</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkPill} onPress={() => setActiveTab('analytics')}>
            <Text style={styles.linkText}>Analitik</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Wallets & Monthly Budget Snapshot */}
      <View style={styles.splitRow}>
        <TouchableOpacity
          style={[styles.card, styles.halfCard]}
          onPress={() => setActiveTab('accounts')}
        >
          <Text style={styles.snapshotKicker}>Total Dompet</Text>
          <Text style={styles.snapshotValue}>{formatRp(accountTotals.totalBalance)}</Text>
          <Text style={styles.snapshotSub}>
            Bersama: {formatRp(accountTotals.sharedBalance)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.halfCard]}
          onPress={() => setActiveTab('budgets')}
        >
          <Text style={styles.snapshotKicker}>Anggaran Bulan Ini</Text>
          <Text style={styles.snapshotValue}>{budgetPct}% terpakai</Text>
          <Text style={styles.snapshotSub}>
            Sisa: {formatRp(budgetTotals.totalRemaining)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Partner Breakdown */}
      <Text style={styles.sectionTitle}>Kontribusi Pasangan ({transactions.length} transaksi)</Text>
      {(summary?.byPartner || []).map((partner) => (
        <View key={partner.partnerId} style={styles.card}>
          <View style={styles.partnerHeader}>
            <Text style={styles.partnerName}>{partner.partnerName}</Text>
            <Text style={styles.partnerNet}>Net: {formatRp(partner.net)}</Text>
          </View>
          <View style={styles.partnerRow}>
            <Text style={styles.incomeText}>Masuk: {formatRp(partner.income)}</Text>
            <Text style={styles.expenseText}>Keluar: {formatRp(partner.expense)}</Text>
          </View>
        </View>
      ))}
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
    padding: SPACING.xl,
    marginBottom: SPACING.md,
    ...SHADOWS.hero,
  },
  heroKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heroSubtle,
    marginBottom: 4,
  },
  heroAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textOnDark,
    marginBottom: SPACING.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroStat: {
    flex: 1,
  },
  heroDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.heroDivider,
    marginHorizontal: SPACING.md,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.heroSubtle,
  },
  heroIncome: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.heroIncome,
    marginTop: 2,
  },
  heroExpense: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.heroExpense,
    marginTop: 2,
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
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  expenseBtn: {
    flex: 1,
    backgroundColor: COLORS.terracottaBtn,
    borderRadius: RADII.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  incomeBtn: {
    flex: 1,
    backgroundColor: COLORS.sageBtn,
    borderRadius: RADII.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 13,
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  presetRow: {
    marginBottom: SPACING.md,
  },
  presetChip: {
    backgroundColor: COLORS.terracottaSoft,
    borderRadius: RADII.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  linkPill: {
    backgroundColor: COLORS.warmSand,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADII.pill,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  splitRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  halfCard: {
    flex: 1,
  },
  snapshotKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  snapshotValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  snapshotSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  partnerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  partnerName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  partnerNet: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.sageDark,
  },
  partnerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
});
