import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, RADII, SHADOWS, SPACING } from '../theme/tokens';
import { evaluateExpression } from '../utils/calculator';
import { formatRp } from '../utils/format';

export interface CalculatorKeypadProps {
  /** Initial numeric value or expression string when uncontrolled */
  initialValue?: number | string;
  /** Optional controlled expression string */
  value?: string;
  /** Called whenever expression or evaluated result changes */
  onChangeValue?: (amount: number | null, expression: string) => void;
  /** Called when user presses "OK Pakai" with a valid non-negative IDR integer */
  onConfirm: (amount: number, expression: string) => void;
  /** Optional cancel handler for modal/inline close action */
  onCancel?: () => void;
  /** Accent color mode matching transaction type */
  accent?: 'expense' | 'income';
  /** Optional testID prefix */
  testID?: string;
}

type KeyKind = 'digit' | 'operator' | 'clear' | 'equals';

interface KeypadButtonDef {
  id: string;
  label: string;
  kind: KeyKind;
  accessibilityLabel: string;
  testSuffix: string;
}

const KEYPAD_ROWS: ReadonlyArray<ReadonlyArray<KeypadButtonDef>> = [
  [
    { id: '7', label: '7', kind: 'digit', accessibilityLabel: '7', testSuffix: '7' },
    { id: '8', label: '8', kind: 'digit', accessibilityLabel: '8', testSuffix: '8' },
    { id: '9', label: '9', kind: 'digit', accessibilityLabel: '9', testSuffix: '9' },
    { id: '÷', label: '÷', kind: 'operator', accessibilityLabel: 'Bagi', testSuffix: 'div' },
  ],
  [
    { id: '4', label: '4', kind: 'digit', accessibilityLabel: '4', testSuffix: '4' },
    { id: '5', label: '5', kind: 'digit', accessibilityLabel: '5', testSuffix: '5' },
    { id: '6', label: '6', kind: 'digit', accessibilityLabel: '6', testSuffix: '6' },
    { id: '×', label: '×', kind: 'operator', accessibilityLabel: 'Kali', testSuffix: 'mul' },
  ],
  [
    { id: '1', label: '1', kind: 'digit', accessibilityLabel: '1', testSuffix: '1' },
    { id: '2', label: '2', kind: 'digit', accessibilityLabel: '2', testSuffix: '2' },
    { id: '3', label: '3', kind: 'digit', accessibilityLabel: '3', testSuffix: '3' },
    { id: '-', label: '-', kind: 'operator', accessibilityLabel: 'Kurang', testSuffix: 'sub' },
  ],
  [
    { id: 'C', label: 'C', kind: 'clear', accessibilityLabel: 'Bersihkan hitungan', testSuffix: 'clear' },
    { id: '0', label: '0', kind: 'digit', accessibilityLabel: '0', testSuffix: '0' },
    { id: '=', label: '=', kind: 'equals', accessibilityLabel: 'Hitung sama dengan', testSuffix: 'eq' },
    { id: '+', label: '+', kind: 'operator', accessibilityLabel: 'Tambah', testSuffix: 'add' },
  ],
];

const OPERATOR_CHARS = new Set(['+', '-', '×', '÷', '*', '/']);

function normalizeInitialExpr(initialValue?: number | string): string {
  if (typeof initialValue === 'number') {
    if (!Number.isFinite(initialValue) || initialValue <= 0) return '';
    return String(Math.round(initialValue));
  }
  if (typeof initialValue === 'string') {
    const trimmed = initialValue.trim();
    return trimmed === '0' ? '' : trimmed;
  }
  return '';
}

function endsWithOperator(expr: string): boolean {
  const trimmed = expr.trimEnd();
  if (!trimmed) return false;
  return OPERATOR_CHARS.has(trimmed[trimmed.length - 1]);
}

export function CalculatorKeypad({
  initialValue,
  value,
  onChangeValue,
  onConfirm,
  onCancel,
  accent = 'expense',
  testID = 'calculator-keypad',
}: CalculatorKeypadProps): React.JSX.Element {
  const isControlled = value !== undefined;
  const [internalExpr, setInternalExpr] = useState<string>(() =>
    normalizeInitialExpr(initialValue)
  );
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!isControlled) {
      setInternalExpr(normalizeInitialExpr(initialValue));
      setErrorText(null);
    }
  }, [initialValue, isControlled]);

  const expression = isControlled ? value : internalExpr;

  const evaluated = useMemo(() => {
    if (!expression.trim()) return null;
    return evaluateExpression(expression);
  }, [expression]);

  const updateExpression = (nextExpr: string) => {
    setErrorText(null);
    if (!isControlled) {
      setInternalExpr(nextExpr);
    }
    const nextAmount = nextExpr.trim() ? evaluateExpression(nextExpr) : null;
    onChangeValue?.(nextAmount, nextExpr);
  };

  const handleDigit = (digit: string) => {
    const current = expression;
    const trimmed = current.trimEnd();

    if (!trimmed) {
      updateExpression(digit);
      return;
    }

    if (trimmed === '0') {
      updateExpression(digit);
      return;
    }

    // Replace isolated trailing '0' right after an operator (e.g., "5000 + 0" -> "5000 + 2")
    const trailingZeroMatch = /^(.*[+\-×÷*/]\s+)0$/.exec(current);
    if (trailingZeroMatch) {
      updateExpression(`${trailingZeroMatch[1]}${digit}`);
      return;
    }

    updateExpression(`${current}${digit}`);
  };

  const handleOperator = (op: string) => {
    const trimmed = expression.trimEnd();
    if (!trimmed) {
      return;
    }

    if (endsWithOperator(trimmed)) {
      const replaced = `${trimmed.slice(0, -1).trimEnd()} ${op} `;
      updateExpression(replaced);
      return;
    }

    updateExpression(`${trimmed} ${op} `);
  };

  const handleClear = () => {
    updateExpression('');
  };

  const handleBackspace = () => {
    const current = expression;
    if (!current) return;

    const trimmedEnd = current.trimEnd();
    if (!trimmedEnd) {
      updateExpression('');
      return;
    }

    const next = trimmedEnd.slice(0, -1).trimEnd();
    // Preserve trailing space after an operator if user deleted the last digit after "500 + 2"
    if (next && endsWithOperator(next)) {
      updateExpression(`${next} `);
    } else {
      updateExpression(next);
    }
  };

  const handleEquals = () => {
    if (!expression.trim()) {
      setErrorText(null);
      return;
    }
    const result = evaluateExpression(expression);
    if (result === null) {
      setErrorText('Ekspresi tidak valid atau pembagian 0');
      return;
    }
    const formattedResult = String(result);
    setErrorText(null);
    if (!isControlled) {
      setInternalExpr(formattedResult);
    }
    onChangeValue?.(result, formattedResult);
  };

  const handleSplitHalf = () => {
    if (!expression.trim()) {
      setErrorText('Masukkan nominal dulu untuk split ÷2');
      return;
    }
    const result = evaluateExpression(expression);
    if (result === null || result <= 0) {
      setErrorText('Selesaikan hitungan positif dulu untuk split ÷2');
      return;
    }
    const splitAmount = Math.round(result / 2);
    const nextExpr = String(splitAmount);
    setErrorText(null);
    if (!isControlled) {
      setInternalExpr(nextExpr);
    }
    onChangeValue?.(splitAmount, nextExpr);
  };

  const handleConfirm = () => {
    if (!expression.trim()) {
      setErrorText('Masukkan nominal terlebih dahulu');
      return;
    }
    const result = evaluateExpression(expression);
    if (result === null) {
      setErrorText('Ekspresi tidak valid atau pembagian 0');
      return;
    }
    setErrorText(null);
    onConfirm(result, String(result));
  };

  const handleKeyPress = (btn: KeypadButtonDef) => {
    if (btn.kind === 'digit') {
      handleDigit(btn.id);
    } else if (btn.kind === 'operator') {
      handleOperator(btn.id);
    } else if (btn.kind === 'clear') {
      handleClear();
    } else {
      handleEquals();
    }
  };

  const hasIncompleteTail = endsWithOperator(expression);

  return (
    <View style={styles.container} testID={testID}>
      {/* Compact Expression & Preview Display */}
      <View style={styles.displayBox}>
        <View style={styles.displayTextCol}>
          <Text
            style={[styles.expressionText, !expression && styles.expressionPlaceholder]}
            numberOfLines={1}
            ellipsizeMode="head"
            testID={`${testID}-expression`}
          >
            {expression || '0'}
          </Text>
          {errorText ? (
            <Text style={styles.errorText} numberOfLines={1} testID={`${testID}-error`}>
              {errorText}
            </Text>
          ) : evaluated !== null ? (
            <Text
              style={[
                styles.previewText,
                { color: accent === 'income' ? COLORS.sageDark : COLORS.terracottaDark },
              ]}
              numberOfLines={1}
              testID={`${testID}-preview`}
            >
              = {formatRp(evaluated)}
            </Text>
          ) : hasIncompleteTail ? (
            <Text style={styles.hintText} numberOfLines={1}>
              Lanjutkan angka berikutnya...
            </Text>
          ) : (
            <Text style={styles.hintMutedText} numberOfLines={1}>
              Ketuk angka atau operasi hitung
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.backspaceBtn}
          onPress={handleBackspace}
          accessibilityRole="button"
          accessibilityLabel="Hapus satu karakter"
          testID={`${testID}-backspace`}
        >
          <Text style={styles.backspaceText}>⌫</Text>
        </TouchableOpacity>
      </View>

      {/* 4-Column Keypad Grid */}
      <View style={styles.grid}>
        {KEYPAD_ROWS.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.gridRow}>
            {row.map((btn) => {
              const btnStyle =
                btn.kind === 'operator'
                  ? styles.keyOperator
                  : btn.kind === 'clear'
                    ? styles.keyClear
                    : btn.kind === 'equals'
                      ? styles.keyEquals
                      : styles.keyDigit;
              const txtStyle =
                btn.kind === 'operator'
                  ? styles.keyOperatorText
                  : btn.kind === 'clear'
                    ? styles.keyClearText
                    : btn.kind === 'equals'
                      ? styles.keyEqualsText
                      : styles.keyDigitText;

              return (
                <TouchableOpacity
                  key={btn.id}
                  style={[styles.keyBase, btnStyle]}
                  onPress={() => handleKeyPress(btn)}
                  accessibilityRole="button"
                  accessibilityLabel={btn.accessibilityLabel}
                  testID={`${testID}-key-${btn.testSuffix}`}
                >
                  <Text style={[styles.keyBaseText, txtStyle]}>{btn.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Quick Action Row: ÷2 Split & OK Pakai */}
      <View style={styles.actionRow}>
        {onCancel && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Tutup kalkulator"
            testID={`${testID}-cancel-btn`}
          >
            <Text style={styles.cancelBtnText}>Tutup</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.splitBtn}
          onPress={handleSplitHalf}
          accessibilityRole="button"
          accessibilityLabel="Bagi dua split tagihan"
          testID={`${testID}-split-btn`}
        >
          <Text style={styles.splitBtnText}>÷2 Split</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.confirmBtn,
            { backgroundColor: accent === 'income' ? COLORS.sageBtn : COLORS.terracottaBtn },
          ]}
          onPress={handleConfirm}
          accessibilityRole="button"
          accessibilityLabel="Pakai hasil hitungan"
          testID={`${testID}-confirm-btn`}
        >
          <Text style={styles.confirmBtnText}>OK Pakai</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.card,
  },
  displayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgCream,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  displayTextCol: {
    flex: 1,
    gap: 2,
  },
  expressionText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  expressionPlaceholder: {
    color: COLORS.textMuted,
  },
  previewText: {
    fontSize: 13,
    fontWeight: '800',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.terracottaDark,
  },
  hintText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  hintMutedText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  backspaceBtn: {
    minWidth: 42,
    minHeight: 42,
    borderRadius: RADII.md,
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  backspaceText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  grid: {
    gap: SPACING.xs + 2,
  },
  gridRow: {
    flexDirection: 'row',
    gap: SPACING.xs + 2,
  },
  keyBase: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADII.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDigit: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  keyOperator: {
    backgroundColor: COLORS.warmSand,
    borderColor: COLORS.borderStrong,
  },
  keyClear: {
    backgroundColor: COLORS.terracottaSoft,
    borderColor: COLORS.terracotta,
  },
  keyEquals: {
    backgroundColor: COLORS.heroCocoa,
    borderColor: COLORS.heroCocoa,
  },
  keyBaseText: {
    fontSize: 17,
    fontWeight: '800',
  },
  keyDigitText: {
    color: COLORS.textPrimary,
  },
  keyOperatorText: {
    color: COLORS.terracottaDark,
    fontSize: 18,
  },
  keyClearText: {
    color: COLORS.terracottaDark,
  },
  keyEqualsText: {
    color: COLORS.textOnDark,
    fontSize: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.xs + 2,
    marginTop: 2,
  },
  cancelBtn: {
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: COLORS.warmSand,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  splitBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADII.md,
    backgroundColor: COLORS.ochreSoft,
    borderWidth: 1,
    borderColor: COLORS.ochre,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  splitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.ochreDark,
  },
  confirmBtn: {
    flex: 1.4,
    minHeight: 44,
    borderRadius: RADII.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.white,
  },
});
