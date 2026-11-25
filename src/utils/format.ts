export const ID_MONTHS: readonly string[] = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const ID_MONTHS_SHORT: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatGroupedDigits(absRounded: number): string {
  return String(absRounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatRp(n: number): string {
  if (!Number.isFinite(n)) return 'Rp 0';
  const rounded = Math.round(n);
  if (rounded === 0) return 'Rp 0';
  const absFormatted = formatGroupedDigits(Math.abs(rounded));
  return rounded < 0 ? `-Rp ${absFormatted}` : `Rp ${absFormatted}`;
}

export function formatSignedRp(amount: number, type: 'income' | 'expense'): string {
  const safeAbs = Number.isFinite(amount) ? Math.abs(Math.round(amount)) : 0;
  if (safeAbs === 0) return 'Rp 0';
  const formatted = formatGroupedDigits(safeAbs);
  return type === 'income' ? `+Rp ${formatted}` : `-Rp ${formatted}`;
}

export function parseIdrInput(raw: string): number {
  const cleaned = raw.trim().replace(/(?:,-|\/-|\.-)$/, '').trim();
  const withoutDecimal = cleaned.replace(/[.,]\d{1,2}$/, '');
  const digits = withoutDecimal.replace(/[^0-9]/g, '');
  if (!digits) return 0;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return 0;
  return Math.trunc(parsed);
}

export function getLocalTzOffset(): number {
  return -new Date().getTimezoneOffset() || 0;
}

export function getCurrentMonthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return `${year}-${pad2(month)}`;
}

export function isValidMonthKey(monthKey: string): boolean {
  return MONTH_KEY_RE.test(monthKey.trim());
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  if (!isValidMonthKey(monthKey)) {
    return getCurrentMonthKey();
  }
  const safeDelta = Number.isFinite(deltaMonths) ? Math.trunc(deltaMonths) : 0;
  const [yStr, mStr] = monthKey.trim().split('-');
  const year = Number(yStr);
  const monthIndex = Number(mStr) - 1;
  const total = year * 12 + monthIndex + safeDelta;
  const nextYear = Math.floor(total / 12);
  const nextMonthIndex = ((total % 12) + 12) % 12;
  return `${nextYear}-${pad2(nextMonthIndex + 1)}`;
}

export function formatMonthLabel(monthKey: string): string {
  if (!isValidMonthKey(monthKey)) return monthKey;
  const [yStr, mStr] = monthKey.trim().split('-');
  const monthIdx = Number(mStr) - 1;
  return `${ID_MONTHS[monthIdx]} ${yStr}`;
}

export function toLocalDateInput(input?: string | Date): string {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (isValidDateInput(trimmed)) {
      return trimmed;
    }
  }
  const d =
    input === undefined
      ? new Date()
      : input instanceof Date
        ? input
        : new Date(input);
  if (Number.isNaN(d.getTime())) {
    return toLocalDateInput(new Date());
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function isValidDateInput(dateInput: string): boolean {
  const match = DATE_INPUT_RE.exec(dateInput.trim());
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(y, m - 1, day, 12, 0, 0, 0);
  return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day;
}

export function dateInputToIso(dateInput: string, referenceIso?: string): string {
  const trimmed = dateInput.trim();
  if (!isValidDateInput(trimmed)) {
    return new Date().toISOString();
  }
  if (referenceIso) {
    const refDate = new Date(referenceIso);
    if (!Number.isNaN(refDate.getTime()) && toLocalDateInput(refDate) === trimmed) {
      return refDate.toISOString();
    }
  }
  if (trimmed === toLocalDateInput(new Date())) {
    return new Date().toISOString();
  }
  const [yStr, mStr, dStr] = trimmed.split('-');
  return new Date(Number(yStr), Number(mStr) - 1, Number(dStr), 12, 0, 0, 0).toISOString();
}

export function shiftDateInput(dateInput: string, deltaDays: number): string {
  if (!isValidDateInput(dateInput)) {
    return toLocalDateInput(new Date());
  }
  const [yStr, mStr, dStr] = dateInput.trim().split('-');
  const shifted = new Date(
    Number(yStr),
    Number(mStr) - 1,
    Number(dStr) + Math.trunc(deltaDays),
    12,
    0,
    0,
    0
  );
  return toLocalDateInput(shifted);
}

export function getDefaultDateInputForMonth(monthKey: string): string {
  if (!isValidMonthKey(monthKey)) {
    return toLocalDateInput(new Date());
  }
  if (monthKey.trim() === getCurrentMonthKey()) {
    return toLocalDateInput(new Date());
  }
  return `${monthKey.trim()}-01`;
}

export function formatShortDateId(iso: string): string {
  const trimmed = iso.trim();
  let d: Date;
  if (isValidDateInput(trimmed)) {
    const [yStr, mStr, dStr] = trimmed.split('-');
    d = new Date(Number(yStr), Number(mStr) - 1, Number(dStr), 12, 0, 0, 0);
  } else {
    d = new Date(iso);
  }
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getDate()} ${ID_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
