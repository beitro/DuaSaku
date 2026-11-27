import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { COLORS, MOTION } from '../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  /** Optional style to merge with internal styles */
  style?: ViewStyle;
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
    style,
  },
  ref
) {
  const padding = SIZE_PADDING[size];
  const reduceMotion = useReduceMotion();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled || disableFeedback) return;
    scaleAnim.stopAnimation();
    opacityAnim.stopAnimation();

    const animations: Animated.CompositeAnimation[] = [
      Animated.timing(opacityAnim, {
        toValue: 0.88,
        duration: 80,
        useNativeDriver: true,
      }),
    ];

    if (!reduceMotion) {
      animations.push(
        Animated.spring(scaleAnim, {
          toValue: 0.97,
          ...MOTION.easing.springPress,
        })
      );
    }

    Animated.parallel(animations).start();
  };

  const handlePressOut = () => {
    if (disabled || disableFeedback) return;
    scaleAnim.stopAnimation();
    opacityAnim.stopAnimation();

    const animations: Animated.CompositeAnimation[] = [
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ];

    if (!reduceMotion) {
      animations.push(
        Animated.spring(scaleAnim, {
          toValue: 1,
          ...MOTION.easing.springPress,
        })
      );
    } else {
      scaleAnim.setValue(1);
    }

    Animated.parallel(animations).start();
  };

  return (
    <AnimatedPressable
      ref={ref as React.Ref<React.ComponentRef<typeof AnimatedPressable>>}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      testID={testID}
      android_ripple={disableFeedback ? undefined : { color: COLORS.terracottaSoft }}
      style={[
        styles.base,
        VARIANT_STYLES[variant],
        {
          paddingHorizontal: padding.h,
          paddingVertical: padding.v,
          borderRadius: SIZE_RADIUS[size],
        },
        !disableFeedback && {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
        disabled && styles.disabled,
        style,
      ]}
    >
      {!!loadingLabel && (
        <Text style={[styles.label, VARIANT_TEXT[variant], { fontSize: SIZE_FONT[size] }]}>
          {loadingLabel}
        </Text>
      )}
      {typeof children === 'string' ? (
        <Text style={[styles.label, VARIANT_TEXT[variant], { fontSize: SIZE_FONT[size] }]}>
          {children}
        </Text>
      ) : (
        children
      )}
    </AnimatedPressable>
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
