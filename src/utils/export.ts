import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import type {
  AccountTransfer,
  CoupleSpace,
  CoupleTransaction,
  MonthlyAnalytics,
  MonthlyBudget,
  MonthlyExportJson,
} from '../types';

export function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  const s = /^[\t\r\n ]*[=+\-@]|^[\t\r\n]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildMonthlyTransactionsCsv(
  transactions: CoupleTransaction[],
  tzOffsetMinutes = 0
): string {
  const header = ['Tanggal', 'Tipe', 'Kategori', 'Dompet', 'Pasangan', 'Nominal', 'Catatan'].join(',');
  const lines = transactions.map((tx) => {
    const localIsoDate = new Date(new Date(tx.occurredAt).getTime() + tzOffsetMinutes * 60_000)
      .toISOString()
      .slice(0, 10);
    return [
      localIsoDate,
      tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      tx.categoryName,
      tx.accountName || 'Tanpa Dompet',
      tx.partnerName,
      Math.round(Number(tx.amount) * 100) / 100,
      tx.note || '',
    ]
      .map(escapeCsvCell)
      .join(',');
  });
  return [header, ...lines].join('\r\n');
}

export function buildMonthlyExportJson(input: {
  month: string;
  tzOffset: number;
  couple: CoupleSpace;
  analytics: MonthlyAnalytics;
  budgets: MonthlyBudget[];
  transactions: CoupleTransaction[];
  transfers: AccountTransfer[];
}): MonthlyExportJson {
  return {
    exportedAt: new Date().toISOString(),
    month: input.month,
    tzOffset: input.tzOffset,
    couple: input.couple,
    summary: {
      month: input.month,
      totalIncome: input.analytics.totals.totalIncome,
      totalExpense: input.analytics.totals.totalExpense,
      netBalance: input.analytics.totals.netBalance,
    },
    analytics: {
      month: input.month,
      totals: input.analytics.totals,
      accountsOverview: input.analytics.accountsOverview,
    },
    budgets: input.budgets,
    transactions: input.transactions,
    transfers: input.transfers,
  };
}

export async function triggerExportDownload(
  filename: string,
  content: string,
  mimeType: string
): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
    return;
  }

  const file = new File(Paths.document, filename);
  if (!file.exists) {
    file.create({ intermediates: true, overwrite: true });
  }
  file.writeSync(content);
  await Share.share({
    title: filename,
    message: content,
    url: file.uri,
  });
}
