import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { COLORS, MOTION, RADII } from '../theme/tokens';

export interface ProgressBarProps {
  progress: number;
  color?: string;
  trackColor?: string;
  height?: number;
  overLimitColor?: string;
  isOverLimit?: boolean;
}

export function ProgressBar({
  progress,
  color = COLORS.sage,
  trackColor = COLORS.warmSand,
  height = 8,
  overLimitColor = COLORS.terracotta,
  isOverLimit = false,
}: ProgressBarProps): React.JSX.Element {
  const safeProgress = Number.isFinite(progress) ? progress : 0;
  const clamped = Math.max(0, Math.min(100, safeProgress));
  const fillColor = isOverLimit || safeProgress > 100 ? overLimitColor : color;
  const reduceMotion = useReduceMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const scaleAnim = useRef(new Animated.Value(clamped / 100)).current;

  useEffect(() => {
    const target = clamped / 100;
    if (reduceMotion) {
      scaleAnim.stopAnimation();
      scaleAnim.setValue(target);
      return;
    }

    scaleAnim.stopAnimation();
    Animated.spring(scaleAnim, {
      toValue: target,
      ...MOTION.easing.springFluid,
    }).start();
  }, [clamped, reduceMotion, scaleAnim]);

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={[
        styles.track,
        {
          height,
          backgroundColor: trackColor,
          borderRadius: RADII.pill,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            width: '100%',
            backgroundColor: fillColor,
            borderRadius: RADII.pill,
            transform: [
              {
                translateX: Animated.multiply(
                  Animated.subtract(scaleAnim, 1),
                  trackWidth / 2
                ),
              },
              { scaleX: scaleAnim },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
