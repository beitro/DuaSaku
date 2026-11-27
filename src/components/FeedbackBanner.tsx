import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { COLORS, MOTION, RADII, SPACING } from '../theme/tokens';

export type FeedbackKind = 'success' | 'error' | 'info';

export interface FeedbackState {
  kind: FeedbackKind;
  message: string;
  title?: string;
  id?: number;
}

export interface FeedbackBannerProps {
  feedback: FeedbackState | null;
  onDismiss: () => void;
}

const KIND_STYLES: Record<
  FeedbackKind,
  { bg: string; border: string; text: string; badge: string }
> = {
  success: {
    bg: COLORS.sageSoft,
    border: COLORS.sage,
    text: COLORS.sageDark,
    badge: '✓',
  },
  error: {
    bg: COLORS.terracottaSoft,
    border: COLORS.terracotta,
    text: COLORS.terracottaDark,
    badge: '!',
  },
  info: {
    bg: COLORS.ochreSoft,
    border: COLORS.ochre,
    text: COLORS.ochreDark,
    badge: 'i',
  },
};

export function FeedbackBanner({
  feedback,
  onDismiss,
}: FeedbackBannerProps): React.JSX.Element | null {
  const reduceMotion = useReduceMotion();
  const [renderedFeedback, setRenderedFeedback] = useState<FeedbackState | null>(feedback);
  const translateY = useRef(new Animated.Value(feedback ? 0 : -10)).current;
  const opacity = useRef(new Animated.Value(feedback ? 1 : 0)).current;

  useEffect(() => {
    if (feedback) {
      setRenderedFeedback(feedback);
      translateY.stopAnimation();
      opacity.stopAnimation();
      translateY.setValue(reduceMotion ? 0 : -10);
      opacity.setValue(0);

      if (reduceMotion) {
        Animated.timing(opacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.parallel([
          Animated.spring(translateY, {
            toValue: 0,
            ...MOTION.easing.springFluid,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start();
      }
      return;
    }

    if (renderedFeedback) {
      translateY.stopAnimation();
      opacity.stopAnimation();

      const animations: Animated.CompositeAnimation[] = [
        Animated.timing(opacity, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
      ];

      if (!reduceMotion) {
        animations.push(
          Animated.timing(translateY, {
            toValue: -10,
            duration: 140,
            useNativeDriver: true,
          })
        );
      }

      Animated.parallel(animations).start(({ finished }) => {
        if (finished) {
          setRenderedFeedback(null);
        }
      });
    }
  }, [feedback, reduceMotion, translateY, opacity, renderedFeedback]);

  if (!renderedFeedback) return null;

  const palette = KIND_STYLES[renderedFeedback.kind];

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      testID="feedback-banner"
      accessibilityRole="alert"
    >
      <View style={[styles.badge, { borderColor: palette.border }]}>
        <Text style={[styles.badgeText, { color: palette.text }]}>{palette.badge}</Text>
      </View>
      <View style={styles.textWrap}>
        {!!renderedFeedback.title && (
          <Text style={[styles.title, { color: palette.text }]}>{renderedFeedback.title}</Text>
        )}
        <Text style={[styles.message, { color: palette.text }]} testID="feedback-message">
          {renderedFeedback.message}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.dismissBtn}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Tutup notifikasi"
        testID="feedback-dismiss-btn"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.dismissText, { color: palette.text }]}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADII.md,
    borderWidth: 1,
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: RADII.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 1,
  },
  message: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  dismissBtn: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
