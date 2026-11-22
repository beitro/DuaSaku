import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, RADII, SHADOWS, SPACING } from '../theme/tokens';
import { formatMonthLabel, getCurrentMonthKey, shiftMonthKey } from '../utils/format';

export interface MonthSelectorProps {
  month: string;
  onChangeMonth: (nextMonth: string) => void;
  disabled?: boolean;
  testIDPrefix?: string;
}

export function MonthSelector({
  month,
  onChangeMonth,
  disabled = false,
  testIDPrefix = 'month',
}: MonthSelectorProps): React.JSX.Element {
  const currentMonth = getCurrentMonthKey();
  const isCurrentMonth = month === currentMonth;

  return (
    <View style={styles.wrapper} testID={`${testIDPrefix}-selector`}>
      <TouchableOpacity
        style={[styles.navBtn, disabled && styles.navBtnDisabled]}
        onPress={() => onChangeMonth(shiftMonthKey(month, -1))}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Bulan sebelumnya"
        testID={`${testIDPrefix}-prev-btn`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.navIcon}>‹</Text>
      </TouchableOpacity>

      <View style={styles.centerBlock}>
        <Text style={styles.kicker}>SELAMA SEBULAN</Text>
        <View style={styles.labelRow}>
          <Text style={styles.monthText} testID={`${testIDPrefix}-label`}>
            {formatMonthLabel(month)}
          </Text>
          {!isCurrentMonth && (
            <TouchableOpacity
              style={styles.todayPill}
              onPress={() => onChangeMonth(currentMonth)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="Kembali ke bulan ini"
              testID={`${testIDPrefix}-today-btn`}
            >
              <Text style={styles.todayPillText}>Bulan Ini</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.navBtn, disabled && styles.navBtnDisabled]}
        onPress={() => onChangeMonth(shiftMonthKey(month, 1))}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Bulan berikutnya"
        testID={`${testIDPrefix}-next-btn`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.navIcon}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: RADII.md,
    backgroundColor: COLORS.warmSand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  navBtnDisabled: {
    opacity: 0.5,
  },
  navIcon: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: COLORS.terracottaDark,
    marginBottom: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  monthText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  todayPill: {
    backgroundColor: COLORS.terracottaSoft,
    borderWidth: 1,
    borderColor: COLORS.terracotta,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  todayPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
});
