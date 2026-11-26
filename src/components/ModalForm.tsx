import React from 'react';
import {
  ActivityIndicator,
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
import { PressableButton } from './PressableButton';
import { COLORS, RADII, SHADOWS, SPACING } from '../theme/tokens';

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
  if (!visible) return null;

  const handleClose = () => {
    if (!submitting) onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      onRequestClose={handleClose}
      testID={testID}
    >
      <View style={[styles.backdrop, Platform.OS === 'web' ? { minHeight: height } : undefined]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoiding}
        >
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.modalCard, cardStyle]}>
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
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
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
