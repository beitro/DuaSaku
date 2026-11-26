import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { COLORS, RADII, SPACING } from '../theme/tokens';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  testID?: string;
}

export interface ChipGroupProps<T extends string> {
  options: ReadonlyArray<ChipOption<T>>;
  selected: T | null;
  onSelect: (value: T) => void;
  /** 'scroll' = single horizontal scrolling row, 'wrap' = multi-line wrap */
  layout?: 'scroll' | 'wrap';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Single-select chip group shared by forms and filters. */
export function ChipGroup<T extends string>({
  options,
  selected,
  onSelect,
  layout = 'scroll',
  style,
  testID,
}: ChipGroupProps<T>): React.JSX.Element {
  const chips = options.map((opt) => {
    const active = selected === opt.value;
    return (
      <TouchableOpacity
        key={opt.value}
        style={[styles.chip, active && styles.chipActive]}
        onPress={() => onSelect(opt.value)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        testID={opt.testID}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
      </TouchableOpacity>
    );
  });

  if (layout === 'wrap') {
    return (
      <View style={[styles.wrap, style]} testID={testID}>
        {chips}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.scroll, style]}
      testID={testID}
    >
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginBottom: SPACING.md,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    marginRight: 6,
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
});
