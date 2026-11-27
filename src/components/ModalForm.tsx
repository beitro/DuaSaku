import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useKeyboardVisible } from '../hooks/useKeyboardVisible';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { PressableButton } from './PressableButton';
import { COLORS, MOTION, RADII, SHADOWS, SPACING } from '../theme/tokens';

export interface ModalFormProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onSubmit: () => void | Promise<void>;
  submitLabel?: string;
  cancelLabel?: string;
  submitting?: boolean;
  showCloseButton?: boolean;
  cardStyle?: StyleProp<ViewStyle>;
  testID?: string;
  submitTestID?: string;
  cancelTestID?: string;
}

export function ModalForm({
  visible,
  onClose,
  title,
  children,
  onSubmit,
  submitLabel = 'Simpan',
  cancelLabel = 'Batal',
  submitting = false,
  showCloseButton = true,
  cardStyle,
  testID,
  submitTestID,
  cancelTestID,
}: ModalFormProps): React.JSX.Element | null {
  const { height } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible();
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

  const handleClose = () => {
    if (submitting || closingRef.current) return;
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
      onClose();
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      testID={testID}
    >
      <Animated.View
        style={[
          styles.backdrop,
          Platform.OS === 'web' ? { minHeight: height } : undefined,
          { opacity: backdropOpacity },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoiding}
        >
          <ScrollView
            contentContainerStyle={[
              styles.modalScroll,
              keyboardVisible && styles.modalScrollKeyboard,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={[
                styles.modalCard,
                cardStyle,
                {
                  opacity: cardOpacity,
                  transform: [{ scale: cardScale }],
                },
              ]}
            >
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                {showCloseButton && (
                  <PressableButton
                    variant="ghost"
                    size="sm"
                    onPress={handleClose}
                    disabled={submitting}
                    accessibilityLabel="Tutup"
                  >
                    <Text style={styles.closeX}>✕</Text>
                  </PressableButton>
                )}
              </View>

              {children}

              <View style={styles.footer}>
                <PressableButton
                  variant="ghost"
                  size="md"
                  onPress={handleClose}
                  disabled={submitting}
                  accessibilityLabel={cancelLabel}
                  testID={cancelTestID}
                >
                  <Text style={styles.cancelText}>{cancelLabel}</Text>
                </PressableButton>
                <PressableButton
                  variant="primary"
                  size="md"
                  onPress={() => {
                    void onSubmit();
                  }}
                  disabled={submitting}
                  accessibilityLabel={submitLabel}
                  testID={submitTestID}
                >
                  {submitting ? (
                    <ActivityIndicator color={COLORS.white} size="small" />
                  ) : (
                    <Text style={styles.submitText}>{submitLabel}</Text>
                  )}
                </PressableButton>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.backdrop,
    padding: SPACING.lg,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
  },
  modalScrollKeyboard: {
    justifyContent: 'flex-start',
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.elevated,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  closeX: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.white,
  },
});
