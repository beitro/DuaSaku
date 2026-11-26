import React from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import type { ViewStyle } from 'react-native';
import { PressableButton } from './PressableButton';
import { COLORS, SPACING, RADII, SHADOWS } from '../theme/tokens';

interface ModalFormProps {
  /** Whether modal is visible */
  visible: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal title */
  title: string;
  /** Form content */
  children: React.ReactNode;
  /** Submit handler */
  onSubmit: () => Promise<void>;
  /** Submit button label */
  submitLabel?: string;
  /** Cancel button label */
  cancelLabel?: string;
  /** Whether submit is in progress */
  submitting?: boolean;
  /** Whether to show close button in header */
  showCloseButton?: boolean;
  /** Custom style for modal card */
  cardStyle?: ViewStyle;
}

export const ModalForm = React.forwardRef<
  { close: () => void },
  ModalFormProps
>(function (
  {
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
  },
  ref,
) {
  const close = () => onClose();

  // Expose close method to parent via ref
  React.useImperativeHandle(ref, () => ({ close }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoiding}
          keyboardVerticalOffset={0}
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
                    onPress={onClose}
                    disabled={submitting}
                    accessibilityLabel="Tutup modal"
                    accessibilityHint="Kembali ke layar sebelumnya"
                  >
                    <Text style={{ color: COLORS.textMuted }}>✕</Text>
                  </PressableButton>
                )}
              </View>

              {children}

              <View style={styles.footer}>
                <PressableButton
                  variant="ghost"
                  size="md"
                  onPress={onClose}
                  disabled={submitting}
                  accessibilityLabel={cancelLabel}
                >
                  <Text style={{ color: COLORS.textSecondary }}>{cancelLabel}</Text>
                </PressableButton>
                <PressableButton
                  variant="primary"
                  size="md"
                  onPress={onSubmit}
                  disabled={submitting}
                  accessibilityLabel={submitLabel}
                >
                  {submitting ? (
                    <ActivityIndicator color={COLORS.white} size="small" />
                  ) : (
                    <Text style={{ color: COLORS.white }}>{submitLabel}</Text>
                  )}
                </PressableButton>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
});

ModalForm.displayName = 'ModalForm';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.backdrop,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: SPACING.xl,
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
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
    marginTop: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});