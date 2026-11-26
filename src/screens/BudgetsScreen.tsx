import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useDuaSaku } from '../context/DuaSakuContext';
import { COLORS, RADII, SHADOWS, SPACING } from '../theme/tokens';
import type { MonthlyBudget } from '../types';
import { formatMonthLabel, formatRp, parseIdrInput } from '../utils/format';
import { RecurringBillsPanel } from '../components/RecurringBillsPanel';
import { DashboardHero } from '../components/DashboardHero';
import { ChipGroup } from '../components/ChipGroup';
import { ModalForm } from '../components/ModalForm';

export function BudgetsScreen(): React.JSX.Element {
  const {
    selectedMonth,
    budgets,
    budgetTotals,
    categories,
    saveBudget,
    updateBudget,
    deleteBudget,
    requestConfirm,
    showError,
  } = useDuaSaku();

  const [subTab, setSubTab] = useState<'budgets' | 'recurring'>('budgets');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<MonthlyBudget | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [limitInput, setLimitInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setCategoryId(categories[0]?.id || '');
    setLimitInput('');
    setModalVisible(true);
  };

  const openEdit = (b: MonthlyBudget) => {
    setEditing(b);
    setCategoryId(b.categoryId);
    setLimitInput(String(Math.round(b.limitAmount)));
    setModalVisible(true);
  };

  const handleSave = async () => {
    const limitAmount = parseIdrInput(limitInput);
    if (!categoryId) {
      showError('Pilih kategori terlebih dahulu.');
      return;
    }
    if (limitAmount <= 0) {
      showError('Batas anggaran harus lebih dari 0.');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await updateBudget(editing.id, { limitAmount });
      } else {
        await saveBudget({ categoryId, month: selectedMonth, limitAmount });
      }
      setModalVisible(false);
    } catch {
      // handled by context
    } finally {
      setSubmitting(false);
    }
  };

  const overallPct =
    budgetTotals.totalLimit > 0
      ? Math.min(100, Math.round((budgetTotals.totalSpent / budgetTotals.totalLimit) * 100))
      : 0;

  return (
    <View style={styles.container} testID="budgets-screen">
      <View style={styles.subTabRow}>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'budgets' && styles.subTabBtnActive]}
          onPress={() => setSubTab('budgets')}
          testID="budgets-subtab-budgets"
        >
          <Text style={[styles.subTabText, subTab === 'budgets' && styles.subTabTextActive]}>
            🎯 Anggaran Bulanan
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'recurring' && styles.subTabBtnActive]}
          onPress={() => setSubTab('recurring')}
          testID="budgets-subtab-recurring"
        >
          <Text style={[styles.subTabText, subTab === 'recurring' && styles.subTabTextActive]}>
            🔁 Tagihan Berulang
          </Text>
        </TouchableOpacity>
      </View>

      {subTab === 'recurring' ? (
        <RecurringBillsPanel />
      ) : (
        <>
          {/* Monthly Budget Hero */}
      <DashboardHero
        kicker={`Anggaran — ${formatMonthLabel(selectedMonth)}`}
        amount={formatRp(budgetTotals.totalRemaining)}
        subtitle={`Sisa dari total batas ${formatRp(budgetTotals.totalLimit)} · Terpakai ${formatRp(budgetTotals.totalSpent)} (${overallPct}%)`}
        actions={
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} testID="add-budget-btn">
            <Text style={styles.addBtnText}>+ Atur Anggaran</Text>
          </TouchableOpacity>
        }
      />

      {/* Budget List */}
      {budgets.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.cardTitle}>Belum ada anggaran bulan ini</Text>
          <Text style={styles.mutedText}>
            Atur batas pengeluaran bulanan per kategori (Menikah, Traveling, Rumah Tangga, dll.).
          </Text>
        </View>
      ) : (
        budgets.map((b) => {
          const pct = Math.min(100, Math.max(0, Math.round(b.progressPercent)));
          const barColor = b.isOverBudget
            ? COLORS.terracottaBtn
            : pct >= 80
              ? COLORS.ochre
              : COLORS.sage;
          return (
            <View key={b.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>
                  {b.categoryIcon} {b.categoryName}
                </Text>
                <Text
                  style={[
                    styles.statusBadge,
                    b.isOverBudget ? styles.overText : styles.okText,
                  ]}
                >
                  {b.isOverBudget
                    ? `Melebihi Batas! (${Math.round(b.progressPercent)}%)`
                    : `${Math.round(b.progressPercent)}%`}
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.mutedText}>
                  Terpakai: {formatRp(b.spent)} / {formatRp(b.limitAmount)}
                </Text>
                <Text style={styles.mutedText}>Sisa: {formatRp(b.remaining)}</Text>
              </View>
              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionPill} onPress={() => openEdit(b)}>
                  <Text style={styles.actionPillText}>Ubah Batas</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionPill, styles.deletePill]}
                  onPress={() =>
                    requestConfirm({
                      title: 'Hapus Anggaran?',
                      message: `Hapus batas anggaran "${b.categoryName}" untuk bulan ini?`,
                      confirmLabel: 'Hapus',
                      destructive: true,
                      onConfirm: () => deleteBudget(b.id),
                    })
                  }
                >
                  <Text style={styles.deletePillText}>Hapus</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {/* Modal Set / Edit Budget */}
      <ModalForm
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={editing ? `Ubah Batas: ${editing.categoryName}` : `Atur Anggaran (${formatMonthLabel(selectedMonth)})`}
        onSubmit={handleSave}
        submitting={submitting}
        submitTestID="budget-save-btn"
      >
        {!editing && (
          <>
            <Text style={styles.label}>Pilih Kategori</Text>
            <ChipGroup
              options={categories.map((cat) => ({ value: cat.id, label: `${cat.icon} ${cat.name}` }))}
              selected={categoryId}
              onSelect={setCategoryId}
            />
          </>
        )}

        <Text style={styles.label}>Batas Anggaran Bulanan (Rp)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={limitInput}
          onChangeText={setLimitInput}
          placeholder="Contoh: 5000000"
          placeholderTextColor={COLORS.textPlaceholder}
        />
      </ModalForm>
        </>
      )}
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
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: '800',
  },
  okText: {
    color: COLORS.sageDark,
  },
  overText: {
    color: COLORS.terracottaDark,
  },
  track: {
    height: 8,
    backgroundColor: COLORS.warmSand,
    borderRadius: RADII.pill,
    overflow: 'hidden',
    marginVertical: 8,
  },
  fill: {
    height: '100%',
    borderRadius: RADII.pill,
  },
  mutedText: {
    fontSize: 12,
    color: COLORS.textMuted,
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
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.elevated,
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
  chipScroll: {
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
    backgroundColor: COLORS.terracottaBtn,
    borderRadius: RADII.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  saveBtnText: {
    color: COLORS.white,
    fontWeight: '800',
  },
  subTabRow: {
    flexDirection: 'row',
    gap: SPACING.xs + 2,
    marginBottom: SPACING.md,
  },
  subTabBtn: {
    flex: 1,
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.pill,
    paddingVertical: 9,
    alignItems: 'center',
  },
  subTabBtnActive: {
    backgroundColor: COLORS.heroCocoa,
    borderColor: COLORS.heroCocoa,
  },
  subTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subTabTextActive: {
    color: COLORS.textOnDark,
  },
});
