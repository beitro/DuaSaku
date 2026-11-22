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
  maxWidth = 720,
  backgroundColor = COLORS.bgCream,
}: AppFrameProps): React.JSX.Element {
  const { width } = useWindowDimensions();
  const isWide = width > maxWidth + 32;
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
            maxWidth,
            width: '100%',
            alignSelf: 'center',
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: COLORS.border,
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
