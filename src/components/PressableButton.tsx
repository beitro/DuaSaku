import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { COLORS } from '../theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface PressableButtonProps {
  /** Button variant */
  variant?: Variant;
  /** Button size */
  size?: Size;
  /** Disable press feedback (scale/opacity) */
  disableFeedback?: boolean;
  /** Loading label (shown before children when provided) */
  loadingLabel?: string;
  /** Children */
  children: React.ReactNode;
  /** On press handler */
  onPress?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Accessibility label for screen readers */
  accessibilityLabel?: string;
  /** Accessibility hint for screen readers */
  accessibilityHint?: string;
  /** Optional testID */
  testID?: string;
}

const VARIANT_STYLES: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: COLORS.terracottaBtn },
  secondary: { backgroundColor: COLORS.sageBtn },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: COLORS.terracottaBtn },
};

export const VARIANT_TEXT: Record<Variant, TextStyle> = {
  primary: { color: COLORS.white },
  secondary: { color: COLORS.white },
  ghost: { color: COLORS.terracottaDark },
  danger: { color: COLORS.white },
};

const SIZE_PADDING: Record<Size, { h: number; v: number }> = {
  sm: { h: 12, v: 6 },
  md: { h: 16, v: 10 },
  lg: { h: 24, v: 14 },
};

const SIZE_RADIUS: Record<Size, number> = { sm: 8, md: 12, lg: 16 };
const SIZE_FONT: Record<Size, number> = { sm: 12, md: 14, lg: 16 };

export const PressableButton = React.forwardRef<React.ComponentRef<typeof Pressable>, PressableButtonProps>(function PressableButton(
  {
    variant = 'primary',
    size = 'md',
    disableFeedback = false,
    loadingLabel,
    children,
    onPress,
    disabled = false,
    accessibilityLabel,
    accessibilityHint,
    testID,
  },
  ref
) {
  const padding = SIZE_PADDING[size];

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      testID={testID}
      android_ripple={disableFeedback ? undefined : { color: COLORS.terracottaSoft }}
      style={({ pressed }) => [
        styles.base,
        VARIANT_STYLES[variant],
        {
          paddingHorizontal: padding.h,
          paddingVertical: padding.v,
          borderRadius: SIZE_RADIUS[size],
        },
        !disableFeedback && pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {!!loadingLabel && (
        <Text style={[styles.label, VARIANT_TEXT[variant], { fontSize: SIZE_FONT[size] }]}>
          {loadingLabel}
        </Text>
      )}
      {children}
    </Pressable>
  );
});

PressableButton.displayName = 'PressableButton';

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 44,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontWeight: '700',
    lineHeight: 20,
  },
});
