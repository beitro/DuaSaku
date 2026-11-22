import type { TextStyle, ViewStyle } from 'react-native';
import type { AccountType } from '../types';

export const COLORS = {
  // Surfaces & Canvas
  bgOuter: '#EFE6D9',        // Wide-screen outer web backdrop
  bgCream: '#FAF6F0',        // Main app background
  surface: '#FFFFFF',        // Card / modal surface
  warmSand: '#F2EAE0',       // Secondary surface / chips / segments
  warmSandHover: '#E8DDD0',
  border: '#E4D7C5',
  borderStrong: '#D3C0AA',

  // Text (all >= 4.5:1 on bgCream / surface / warmSand)
  textPrimary: '#2C211B',    // Espresso (14.55:1 on cream)
  textSecondary: '#6B5B51',  // Warm Taupe (6.02:1 on cream)
  textMuted: '#76675D',      // Warm Stone (5.04:1 on cream, 4.56:1 on sand)
  textPlaceholder: '#8C7B70',// Input placeholders only
  textOnDark: '#FAF6F0',     // Cream on Hero Cocoa (12.13:1)

  // Terracotta (Primary / Expense)
  terracotta: '#C86446',     // Brand accent, borders, active indicators
  terracottaBtn: '#B35135',  // White-text CTA buttons (5.07:1)
  terracottaDark: '#A44A30', // Expense text on white/soft (5.83:1 / 5.15:1)
  terracottaSoft: '#FCEEE9', // Soft badge/banner fill

  // Sage (Positive / Income)
  sage: '#5B8260',           // Brand accent, progress bars, borders
  sageBtn: '#4D7353',        // White-text CTA buttons (5.39:1)
  sageDark: '#426346',       // Income text on white/soft (6.76:1 / 5.98:1)
  sageSoft: '#EBF3EC',       // Soft badge/banner fill

  // Ochre (Warning / Info)
  ochre: '#D08E35',          // Accent border / 80%+ budget bar
  ochreDark: '#8F5B14',      // Warning text on white/soft (5.72:1 / 5.24:1)
  ochreSoft: '#FDF4E4',      // Soft warning/info banner fill

  // Hero Cocoa
  heroCocoa: '#3B2E28',
  heroSubtle: '#D9CBBF',     // 8.24:1 on heroCocoa
  heroIncome: '#9AD1A0',     // 7.47:1 on heroCocoa
  heroExpense: '#F4A58E',    // 6.61:1 on heroCocoa
  heroDivider: '#52423A',

  // Overlay & Utility
  white: '#FFFFFF',
  backdrop: 'rgba(44, 33, 27, 0.48)',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const RADII = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const TYPOGRAPHY: Record<
  'heroAmount' | 'title' | 'section' | 'cardTitle' | 'body' | 'label' | 'caption',
  TextStyle
> = {
  heroAmount: { fontSize: 28, fontWeight: '800', color: COLORS.textOnDark },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  section: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  body: { fontSize: 14, fontWeight: '400', color: COLORS.textPrimary, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  caption: { fontSize: 12, fontWeight: '500', color: COLORS.textMuted },
};

export const SHADOWS: Record<'card' | 'elevated' | 'hero', ViewStyle> = {
  card: {
    shadowColor: '#2C211B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#2C211B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 5,
  },
  hero: {
    shadowColor: '#2C211B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
};

export const CATEGORY_COLOR_PRESETS = [
  '#C86446', // Terracotta (Matches server Menikah)
  '#5B8260', // Sage (Matches server Traveling)
  '#426346', // Deep Sage (Matches server Investasi)
  '#D08E35', // Ochre (Matches server Rumah Tangga)
  '#8C6D5A', // Warm Clay (Matches server DEFAULT_CATEGORY_COLOR)
  '#A44A30', // Burnt Terracotta
  '#6B5B51', // Warm Taupe
  '#B6765C', // Rose Clay
] as const;

export const ACCOUNT_COLOR_PRESETS = [
  '#5F8563', // Wallet Sage (Matches server DEFAULT_ACCOUNT_COLOR)
  '#C86446', // Terracotta
  '#426346', // Forest Sage
  '#D08E35', // Ochre
  '#8C6D5A', // Warm Clay
  '#6B5B51', // Taupe
] as const;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Tunai',
  bank: 'Rekening Bank',
  ewallet: 'E-Wallet',
  shared_savings: 'Tabungan Bersama',
  other: 'Lainnya',
};

export const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  cash: '💵',
  bank: '🏦',
  ewallet: '📱',
  shared_savings: '🫶',
  other: '💳',
};

export const QUICK_AMOUNT_PRESETS: ReadonlyArray<{ label: string; amount: number }> = [
  { label: '25rb', amount: 25_000 },
  { label: '50rb', amount: 50_000 },
  { label: '100rb', amount: 100_000 },
  { label: '250rb', amount: 250_000 },
  { label: '500rb', amount: 500_000 },
  { label: '1jt', amount: 1_000_000 },
];
