import React from 'react';
import {
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { COLORS } from '../theme/tokens';

export interface AppFrameProps {
  children: React.ReactNode;
  maxWidth?: number;
  backgroundColor?: string;
}

export function AppFrame({
  children,
  maxWidth = 420,
  backgroundColor = COLORS.bgCream,
}: AppFrameProps): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const effectiveMax = isLandscape ? Math.min(width - 32, 720) : maxWidth;
  const isWide = width > effectiveMax + 32;
  const androidTopInset = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

  return (
    <SafeAreaView
      style={[
        styles.outer,
        {
          backgroundColor: isWide ? COLORS.bgOuter : backgroundColor,
          paddingTop: androidTopInset,
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          { backgroundColor },
          isWide && {
            maxWidth: effectiveMax,
            width: '100%',
            alignSelf: 'center',
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: COLORS.borderStrong,
            shadowColor: '#2C211B',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.1,
            shadowRadius: 24,
            elevation: 6,
          },
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
});
