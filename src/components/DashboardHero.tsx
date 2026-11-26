import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { COLORS, MOTION, RADII, SHADOWS, SPACING } from '../theme/tokens';
import { PressableButton } from './PressableButton';

export interface DashboardHeroProps {
  /** Small label at the top (e.g. "Saldo Bersih — November 2026") */
  kicker: string;
  /** Large headline amount (already formatted) */
  amount?: string;
  /** Muted line below the amount */
  subtitle?: React.ReactNode;
  /** Buttons rendered on the right side of the kicker row */
  actions?: React.ReactNode;
  /** Structured actions using PressableButton */
  primaryActions?: Array<{
    label: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md';
  }>;
  /** Extra content (stats rows, KPI grids) */
  children?: React.ReactNode;
  /** Inner padding size */
  padding?: 'lg' | 'xl';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Shared cocoa hero card used by Dashboard, Analytics, Accounts, Budgets & panels. */
export function DashboardHero({
  kicker,
  amount,
  subtitle,
  actions,
  primaryActions,
  children,
  padding = 'lg',
  style,
  testID,
}: DashboardHeroProps): React.JSX.Element {
  return (
    <View
      style={[styles.card, { padding: padding === 'xl' ? SPACING.xl : SPACING.lg }, style]}
      testID={testID}
    >
      <View style={styles.topRow}>
        <Text style={styles.kicker}>{kicker}</Text>
        {actions && <View style={styles.actions}>{actions}</View>}
        {primaryActions?.map((action, index) => (
          <PressableButton
            key={index}
            variant={action.variant || 'primary'}
            size={action.size || 'sm'}
            onPress={action.onPress}
            style={{ marginLeft: SPACING.xs }}
          >
            <Text style={{ color: COLORS.white }}>{action.label}</Text>
          </PressableButton>
        ))}
      </View>
      {amount !== undefined && <Text style={styles.amount}>{amount}</Text>}
      {subtitle !== undefined &&
        (typeof subtitle === 'string' ? <Text style={styles.subtitle}>{subtitle}</Text> : subtitle)}
      {!!children && <View style={styles.body}>{children}</View>}
    </View>
  );
}

/** Two-column income/expense stat row for use inside DashboardHero. */
export function HeroStatRow({
  items,
}: {
  items: Array<{ label: string; value: string; tone?: 'income' | 'expense' | 'light' }>;
}): React.JSX.Element {
  return (
    <View style={styles.statRow}>
      {items.map((it, idx) => (
        <React.Fragment key={it.label}>
          {idx > 0 && <View style={styles.divider} />}
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{it.label}</Text>
            <Text
              style={[
                styles.statValue,
                it.tone === 'income'
                  ? { color: COLORS.heroIncome }
                  : it.tone === 'expense'
                    ? { color: COLORS.heroExpense }
                    : { color: COLORS.textOnDark },
              ]}
            >
              {it.value}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.heroCocoa,
    borderRadius: RADII.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.hero,
    // Motion animation ready - can be combined with Reanimated
    // transition: {
    //   duration: MOTION.duration.normal,
    //   easing: MOTION.easing.standard,
    // },
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heroSubtle,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
  },
  amount: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textOnDark,
    marginTop: 6,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.heroSubtle,
  },
  body: {
    marginTop: SPACING.md,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.heroDivider,
    marginHorizontal: SPACING.md,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.heroSubtle,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
});
