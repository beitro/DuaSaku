import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDuaSaku } from '../context/DuaSakuContext';
import { COLORS, RADII, SHADOWS, SPACING } from '../theme/tokens';
import { formatMonthLabel, formatRp } from '../utils/format';

export function AnalyticsScreen(): React.JSX.Element {
  const { selectedMonth, analytics } = useDuaSaku();

  const totals = analytics?.totals ?? {
    totalIncome: 0,
    totalExpense: 0,
    netBalance: 0,
    savingsRate: 0,
    transactionCount: 0,
  };

  return (
    <View style={styles.container} testID="analytics-screen">
      {/* Monthly Overview */}
      <View style={styles.heroCard}>
        <Text style={styles.heroKicker}>Analitik — {formatMonthLabel(selectedMonth)}</Text>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Pemasukan</Text>
            <Text style={styles.kpiIncome}>{formatRp(totals.totalIncome)}</Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Pengeluaran</Text>
            <Text style={styles.kpiExpense}>{formatRp(totals.totalExpense)}</Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Savings Rate</Text>
            <Text style={styles.kpiLight}>{Math.round(totals.savingsRate)}%</Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Transaksi</Text>
            <Text style={styles.kpiLight}>{totals.transactionCount}x</Text>
          </View>
        </View>
      </View>

      {/* Category Breakdown */}
      <Text style={styles.sectionTitle}>Rincian per Kategori / Pos</Text>
      {(analytics?.byCategory || []).map((cat) => {
        const barWidth = Math.min(100, Math.max(0, Math.round(cat.expensePercent)));
        return (
          <View key={cat.categoryId} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>
                {cat.icon} {cat.categoryName}
              </Text>
              <Text style={styles.pctBadge}>{Math.round(cat.expensePercent)}% keluar</Text>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${barWidth}%`, backgroundColor: cat.color || COLORS.terracotta },
                ]}
              />
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.incomeText}>Masuk: {formatRp(cat.income)}</Text>
              <Text style={styles.expenseText}>Keluar: {formatRp(cat.expense)}</Text>
            </View>
          </View>
        );
      })}

      {/* Partner Breakdown */}
      <Text style={styles.sectionTitle}>Kontribusi Pasangan</Text>
      {(analytics?.byPartner || []).map((partner) => (
        <View key={partner.partnerId} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>
              {partner.partnerName} ({partner.roleLabel})
            </Text>
            <Text style={styles.mutedText}>{partner.transactionCount} transaksi</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.incomeText}>
              Masuk: {formatRp(partner.income)} ({Math.round(partner.incomePercent)}%)
            </Text>
            <Text style={styles.expenseText}>
              Keluar: {formatRp(partner.expense)} ({Math.round(partner.expensePercent)}%)
            </Text>
          </View>
          <Text style={styles.netText}>Kontribusi Bersih: {formatRp(partner.net)}</Text>
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
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.hero,
  },
  heroKicker: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.heroSubtle,
    marginBottom: SPACING.md,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  kpiItem: {
    width: '46%',
  },
  kpiLabel: {
    fontSize: 11,
    color: COLORS.heroSubtle,
  },
  kpiIncome: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.heroIncome,
    marginTop: 2,
  },
  kpiExpense: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.heroExpense,
    marginTop: 2,
  },
  kpiLight: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textOnDark,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
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
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  pctBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
  track: {
    height: 8,
    backgroundColor: COLORS.warmSand,
    borderRadius: RADII.pill,
    overflow: 'hidden',
    marginBottom: 8,
  },
  fill: {
    height: '100%',
    borderRadius: RADII.pill,
  },
  incomeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.sageDark,
  },
  expenseText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
  mutedText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  netText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
});
