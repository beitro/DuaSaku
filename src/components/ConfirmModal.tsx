import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { COLORS, MOTION, RADII, SHADOWS, SPACING } from '../theme/tokens';

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps): React.JSX.Element | null {
  const { height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.95)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    backdropOpacity.stopAnimation();
    cardScale.stopAnimation();
    cardOpacity.stopAnimation();

    backdropOpacity.setValue(0);
    cardOpacity.setValue(0);
    cardScale.setValue(reduceMotion ? 1 : 0.95);

    const animations: Animated.CompositeAnimation[] = [
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      reduceMotion
        ? Animated.timing(cardOpacity, {
            toValue: 1,
            ...MOTION.easing.timingReduced,
          })
        : Animated.spring(cardOpacity, {
            toValue: 1,
            ...MOTION.easing.springFluid,
          }),
    ];

    if (!reduceMotion) {
      animations.push(
        Animated.spring(cardScale, {
          toValue: 1,
          ...MOTION.easing.springFluid,
        })
      );
    }

    Animated.parallel(animations).start();
  }, [visible, reduceMotion, backdropOpacity, cardScale, cardOpacity]);

  if (!visible) return null;

  const handleCancel = () => {
    if (loading || closingRef.current) return;
    closingRef.current = true;
    backdropOpacity.stopAnimation();
    cardScale.stopAnimation();
    cardOpacity.stopAnimation();

    const animations: Animated.CompositeAnimation[] = [
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
    ];

    if (!reduceMotion) {
      animations.push(
        Animated.timing(cardScale, {
          toValue: 0.95,
          duration: 120,
          useNativeDriver: true,
        })
      );
    }

    Animated.parallel(animations).start(() => {
      closingRef.current = false;
      onCancel();
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleCancel}
      testID="confirm-modal"
    >
      <Animated.View
        style={[
          styles.backdrop,
          Platform.OS === 'web' ? { minHeight: height } : undefined,
          { opacity: backdropOpacity },
        ]}
      >
        <Animated.View
          style={[
            styles.card,
            {
              opacity: cardOpacity,
              transform: [{ scale: cardScale }],
            },
          ]}
        >
          <Text style={styles.title} testID="confirm-title">
            {title}
          </Text>
          <Text style={styles.message} testID="confirm-message">
            {message}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancel}
              disabled={loading}
              accessibilityRole="button"
              testID="confirm-cancel-btn"
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                { backgroundColor: destructive ? COLORS.terracottaBtn : COLORS.sageBtn },
                loading && styles.btnDisabled,
              ]}
              onPress={onConfirm}
              disabled={loading}
              accessibilityRole="button"
              testID="confirm-ok-btn"
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.backdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.elevated,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  cancelBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADII.md,
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 40,
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  confirmBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADII.md,
    minHeight: 40,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
  btnDisabled: {
    opacity: 0.65,
  },
});
