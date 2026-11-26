import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ProgressBar } from '../components/ProgressBar';
import { useDuaSaku } from '../context/DuaSakuContext';
import {
  CATEGORY_COLOR_PRESETS,
  COLORS,
  RADII,
  SHADOWS,
  SPACING,
} from '../theme/tokens';
import type { CategoryGoal } from '../types';
import { formatMonthLabel, formatRp, parseIdrInput } from '../utils/format';
import { ModalForm } from '../components/ModalForm';
import { ChipGroup } from '../components/ChipGroup';
import { PressableButton } from '../components/PressableButton';

const EMOJI_PRESETS = ['✨', '🏡', '🎓', '👶', '🚗', '🩺', '🛍️', '🎁'] as const;

export function CategoriesScreen(): React.JSX.Element {
  const {
    categories,
    summary,
    selectedMonth,
    loading,
    createCategory,
    updateCategory,
    deleteCategory,
    requestConfirm,
    openNewTransaction,
  } = useDuaSaku();

  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryGoal | null>(null);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('✨');
  const [catColor, setCatColor] = useState<string>(CATEGORY_COLOR_PRESETS[0]);
  const [catTarget, setCatTarget] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const statsByCatId = useMemo(() => {
    const map = new Map<string, { income: number; spent: number }>();
    for (const item of summary?.byCategory ?? []) {
      map.set(item.categoryId, { income: item.income, spent: item.spent });
    }
    return map;
  }, [summary]);

  const openCreateModal = () => {
    setEditingCategory(null);
    setCatName('');
    setCatIcon('✨');
    setCatColor(CATEGORY_COLOR_PRESETS[0]);
    setCatTarget('');
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (cat: CategoryGoal) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatIcon(cat.icon || '✨');
    setCatColor(cat.color || CATEGORY_COLOR_PRESETS[0]);
    setCatTarget(cat.targetAmount > 0 ? String(Math.round(cat.targetAmount)) : '');
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (loading) return;
    setShowModal(false);
    setEditingCategory(null);
    setFormError(null);
  };

  const handleSave = async () => {
    setFormError(null);
    const trimmedName = catName.trim();
    if (trimmedName.length < 2) {
      setFormError('Nama pos/kategori minimal 2 karakter.');
      return;
    }
    const parsedTarget = parseIdrInput(catTarget);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, {
          name: trimmedName,
          icon: catIcon.trim() || '✨',
          color: catColor,
          targetAmount: parsedTarget,
        });
      } else {
        await createCategory({
          name: trimmedName,
          icon: catIcon.trim() || '✨',
          color: catColor,
          targetAmount: parsedTarget,
        });
      }
      setEditingCategory(null);
      setCatName('');
      setCatIcon('✨');
      setCatColor(CATEGORY_COLOR_PRESETS[0]);
      setCatTarget('');
      setShowModal(false);
    } catch {
      // Error surfaced via FeedbackBanner
    }
  };

  const handleDeletePress = (cat: CategoryGoal) => {
    requestConfirm({
      title: 'Hapus Pos Keuangan?',
      message: `Hapus pos "${cat.name}"? Pos yang masih dipakai transaksi, anggaran, atau catatan tidak dapat dihapus.`,
      confirmLabel: 'Hapus',
      cancelLabel: 'Batal',
      destructive: true,
      onConfirm: () => deleteCategory(cat.id),
    });
  };

  return (
    <View style={styles.container} testID="categories-screen">
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.sectionTitle}>Pos Keuangan & Target</Text>
          <Text style={styles.sectionSub}>
            Aktivitas bulan {formatMonthLabel(selectedMonth)}
          </Text>
        </View>
        <PressableButton
          variant="primary"
          size="sm"
          onPress={openCreateModal}
          testID="categories-add-btn"
        >
          + Tambah Pos
        </PressableButton>
      </View>

      {categories.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Belum ada pos keuangan</Text>
          <Text style={styles.emptySub}>
            Tambahkan pos untuk mengelompokkan pemasukan, pengeluaran, dan target tabungan berdua.
          </Text>
        </View>
      ) : (
        categories.map((cat) => {
          const stat = statsByCatId.get(cat.id) ?? { income: 0, spent: 0 };
          const pct =
            cat.targetAmount > 0
              ? Math.round((stat.spent / cat.targetAmount) * 100)
              : 0;
          return (
            <View
              key={cat.id}
              style={styles.card}
              testID={`category-card-${cat.id}`}
            >
              <View style={styles.cardTopRow}>
                <View style={styles.titleWrap}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: COLORS.warmSand, borderColor: cat.color || COLORS.border },
                    ]}
                  >
                    <Text style={styles.iconText}>{cat.icon}</Text>
                  </View>
                  <View style={styles.titleInfo}>
                    <Text style={styles.cardTitle}>{cat.name}</Text>
                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.colorDot,
                          { backgroundColor: cat.color || COLORS.sage },
                        ]}
                      />
                      <Text style={styles.kindBadge}>
                        {cat.isDefault ? 'Bawaan' : 'Custom'}
                      </Text>
                    </View>
                  </View>
                </View>

                <PressableButton
                  variant="ghost"
                  size="sm"
                  onPress={() => openNewTransaction('expense', undefined, cat.id)}
                  testID={`category-quick-add-${cat.id}`}
                >
                  + Catat
                </PressableButton>
              </View>

              <View style={styles.statsRow}>
                <Text style={styles.incomeStat}>Masuk: {formatRp(stat.income)}</Text>
                <Text style={styles.spentStat}>Terpakai: {formatRp(stat.spent)}</Text>
              </View>

              {cat.targetAmount > 0 && (
                <View style={styles.targetWrap}>
                  <View style={styles.targetLabelRow}>
                    <Text style={styles.targetLabel}>
                      Target: {formatRp(cat.targetAmount)}
                    </Text>
                    <Text style={styles.pctLabel}>{pct}% terpakai</Text>
                  </View>
                  <ProgressBar
                    progress={pct}
                    color={cat.color || COLORS.sage}
                    isOverLimit={cat.targetAmount > 0 && stat.spent > cat.targetAmount}
                  />
                </View>
              )}

              <View style={styles.cardActionsRow}>
                <TouchableOpacity
                  style={styles.actionPill}
                  onPress={() => openEditModal(cat)}
                  disabled={loading}
                  accessibilityRole="button"
                  testID={`category-edit-${cat.id}`}
                >
                  <Text style={styles.actionPillText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionPill, styles.deletePill]}
                  onPress={() => handleDeletePress(cat)}
                  disabled={loading}
                  accessibilityRole="button"
                  testID={`category-delete-${cat.id}`}
                >
                  <Text style={styles.deletePillText}>Hapus</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {showModal && (
        <ModalForm
          visible={showModal}
          onClose={closeModal}
          title={editingCategory ? 'Edit Pos Keuangan' : 'Tambah Kategori / Pos Baru'}
          children={
            <>
              <Text style={styles.label}>Nama Kategori</Text>
              <TextInput
                style={styles.input}
                value={catName}
                onChangeText={(text) => {
                  setCatName(text);
                  if (formError) setFormError(null);
                }}
                placeholder="Contoh: Dana Darurat / Cicilan Rumah"
                placeholderTextColor={COLORS.textPlaceholder}
                testID="category-name-input"
              />

              <Text style={styles.label}>Ikon Emoji</Text>
              <TextInput
                style={styles.input}
                value={catIcon}
                onChangeText={setCatIcon}
                placeholder="✨"
                placeholderTextColor={COLORS.textPlaceholder}
                maxLength={8}
                testID="category-icon-input"
              />
              <ChipGroup
                options={EMOJI_PRESETS.map((emoji) => ({ label: emoji, value: emoji }))}
                selected={catIcon}
                onSelect={setCatIcon}
                layout="wrap"
                testID="category-emoji-chips"
              />

              <Text style={styles.label}>Warna Aksen</Text>
              <View style={styles.colorRow}>
                {CATEGORY_COLOR_PRESETS.map((preset, idx) => (
                  <TouchableOpacity
                    key={preset}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: preset },
                      catColor === preset && styles.colorSwatchActive,
                    ]}
                    onPress={() => setCatColor(preset)}
                    accessibilityRole="button"
                    accessibilityLabel={`Pilih warna ${preset}`}
                    testID={`category-color-${idx}`}
                  />
                ))}
              </View>

              <Text style={styles.label}>Target Anggaran (Opsional)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={catTarget}
                onChangeText={setCatTarget}
                placeholder="Contoh: 25000000"
                placeholderTextColor={COLORS.textPlaceholder}
                testID="category-target-input"
              />

              {!!formError && (
                <View style={styles.inlineErrorBox}>
                  <Text style={styles.inlineErrorText}>{formError}</Text>
                </View>
              )}
            </>
          }
          onSubmit={handleSave}
          submitting={loading}
          submitLabel={editingCategory ? 'Simpan Perubahan' : 'Tambah Pos'}
          cancelLabel="Batal"
          submitTestID="category-save-btn"
          cancelTestID="category-cancel-btn"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  headerText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  sectionSub: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: COLORS.sageSoft,
    borderWidth: 1,
    borderColor: COLORS.sage,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.sageDark,
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
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.md + 2,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: RADII.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 18,
  },
  titleInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: RADII.pill,
  },
  kindBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  incomeStat: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.sageDark,
  },
  spentStat: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
  targetWrap: {
    marginTop: SPACING.sm,
    gap: SPACING.xs + 2,
  },
  targetLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  targetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  pctLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.sm + 2,
  },
  actionPill: {
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  deletePill: {
    backgroundColor: COLORS.terracottaSoft,
    borderColor: COLORS.terracotta,
  },
  deletePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs + 2,
  },
  input: {
    backgroundColor: COLORS.bgCream,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: RADII.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: COLORS.textPrimary,
    transform: [{ scale: 1.1 }],
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
});
