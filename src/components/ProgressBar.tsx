import React from 'react';
import { StyleSheet, View } from 'react-native';
import { COLORS, RADII } from '../theme/tokens';

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

  return (
    <View
      style={[
        styles.track,
        {
          height,
          backgroundColor: trackColor,
          borderRadius: RADII.pill,
        },
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${clamped}%`,
            backgroundColor: fillColor,
            borderRadius: RADII.pill,
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
