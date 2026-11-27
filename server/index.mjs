import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import { createHash, createHmac, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

const DEFAULT_CATEGORIES = [
  { name: 'Menikah (Wedding)', icon: '💍', color: '#C86446', targetAmount: 100000000, isDefault: true },
  { name: 'Traveling & Jalan-Jalan', icon: '✈️', color: '#5B8260', targetAmount: 25000000, isDefault: true },
  { name: 'Investasi Bersama', icon: '📈', color: '#426346', targetAmount: 50000000, isDefault: true },
  { name: 'Rumah Tangga', icon: '🏠', color: '#D08E35', targetAmount: 10000000, isDefault: true },
];

const DEFAULT_QUICK_PRESETS = [
  { label: 'Kopi Pagi', type: 'expense', amount: 25000, categoryKeyword: 'Rumah Tangga', note: 'Kopi pagi' },
  { label: 'Makan Siang', type: 'expense', amount: 45000, categoryKeyword: 'Rumah Tangga', note: 'Makan siang' },
  { label: 'Transportasi', type: 'expense', amount: 30000, categoryKeyword: 'Traveling', note: 'Ongkos transportasi' },
];

const PARTNER_A_COLOR = '#5B8260';
const PARTNER_B_COLOR = '#C86446';
const DEFAULT_CATEGORY_COLOR = '#8C6D5A';
const DEFAULT_ACCOUNT_ICON = '💳';
const DEFAULT_ACCOUNT_COLOR = '#5F8563';
const ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'shared_savings', 'other'];
const RECURRING_FREQUENCIES = ['weekly', 'monthly', 'yearly'];
const DEBT_DIRECTIONS = ['payable', 'receivable'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ============================================================================
// Shared Pure Validation & Timezone Helpers
// ============================================================================
function assertUuid(val, label = 'ID') {
  if (typeof val !== 'string' || !UUID_RE.test(val.trim())) {
    throw new HttpError(400, `${label} tidak valid.`);
  }
  return val.trim();
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function parseStrictNumber(val, message, { min, exclusiveMin } = {}) {
  if (
    val === undefined ||
    val === null ||
    typeof val === 'boolean' ||
    Array.isArray(val) ||
    typeof val === 'object' ||
    (typeof val === 'string' && val.trim() === '')
  ) {
    throw new HttpError(400, message);
  }
  const n = Number(val);
  if (!Number.isFinite(n)) {
    throw new HttpError(400, message);
  }
  const rounded = roundMoney(n);
  if (min !== undefined && rounded < min) {
    throw new HttpError(400, message);
  }
  if (exclusiveMin !== undefined && rounded <= exclusiveMin) {
    throw new HttpError(400, message);
  }
  return rounded;
}

function signedDelta(type, amount) {
  return type === 'income' ? amount : -amount;
}

function parseTzOffset(rawTz) {
  if (rawTz === undefined || rawTz === null || (typeof rawTz === 'string' && rawTz.trim() === '')) {
    return 0;
  }
  if (typeof rawTz === 'boolean' || Array.isArray(rawTz) || typeof rawTz === 'object') {
    throw new HttpError(400, 'Parameter tzOffset harus berupa angka.');
  }
  const n = Number(rawTz);
  if (!Number.isFinite(n)) {
    throw new HttpError(400, 'Parameter tzOffset harus berupa angka.');
  }
  return Math.max(-840, Math.min(840, Math.trunc(n)));
}

function getCurrentMonth(tzOffset = 0) {
  const shifted = new Date(Date.now() + tzOffset * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function validateMonth(rawMonth, { required = false, defaultTzOffset = 0 } = {}) {
  if (rawMonth === undefined || rawMonth === null || String(rawMonth).trim() === '') {
    return required ? getCurrentMonth(defaultTzOffset) : null;
  }
  const monthStr = String(rawMonth).trim();
  if (!MONTH_RE.test(monthStr)) {
    throw new HttpError(400, 'Format bulan harus YYYY-MM.');
  }
  return monthStr;
}

function getMonthBounds(monthStr, tzOffset = 0) {
  const [year, month] = monthStr.split('-').map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthZeroIdx = month === 12 ? 0 : month;
  const offsetMs = tzOffset * 60_000;
  const startMs = Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - offsetMs;
  const endMs = Date.UTC(nextYear, nextMonthZeroIdx, 1, 0, 0, 0, 0) - offsetMs;
  return {
    month: monthStr,
    tzOffset,
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function parseOccurredAt(val, { allowUndefined = true } = {}) {
  if (val === undefined) {
    return new Date().toISOString();
  }
  if (val === null || val === '') {
    if (allowUndefined) return new Date().toISOString();
    throw new HttpError(400, 'Tanggal transaksi (occurredAt) tidak valid.');
  }
  if (typeof val === 'boolean' || Array.isArray(val)) {
    throw new HttpError(400, 'Tanggal transaksi (occurredAt) tidak valid.');
  }
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, 'Tanggal transaksi (occurredAt) tidak valid.');
  }
  return d.toISOString();
}

function computeAccountTotals(accounts) {
  let totalBalance = 0;
  let sharedBalance = 0;
  let personalBalance = 0;
  for (const acc of accounts) {
    const bal = roundMoney(acc.balance);
    totalBalance = roundMoney(totalBalance + bal);
    if (acc.isShared) sharedBalance = roundMoney(sharedBalance + bal);
    else personalBalance = roundMoney(personalBalance + bal);
  }
  return { totalBalance, sharedBalance, personalBalance };
}

function buildMonthlyBudget(budgetRow, spentAmount) {
  const limitAmount = roundMoney(budgetRow.limitAmount);
  const spent = roundMoney(spentAmount);
  const remaining = roundMoney(limitAmount - spent);
  const progressPercent = limitAmount > 0 ? Math.round((spent / limitAmount) * 100) : 0;
  return {
    id: budgetRow.id,
    coupleId: budgetRow.coupleId,
    categoryId: budgetRow.categoryId,
    categoryName: budgetRow.categoryName,
    categoryIcon: budgetRow.categoryIcon,
    categoryColor: budgetRow.categoryColor,
    month: budgetRow.month,
    limitAmount,
    spent,
    remaining,
    progressPercent,
    isOverBudget: spent > limitAmount,
  };
}

function parseRequiredText(val, message) {
  if (
    val === undefined ||
    val === null ||
    typeof val === 'boolean' ||
    Array.isArray(val) ||
    typeof val === 'object'
  ) {
    throw new HttpError(400, message);
  }
  const clean = String(val).trim();
  if (!clean) {
    throw new HttpError(400, message);
  }
  return clean;
}

function getTodayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function parseDateYmd(val, message = 'Format tanggal harus YYYY-MM-DD.', { allowUndefined = false, allowNull = false } = {}) {
  if (val === undefined) {
    if (allowUndefined) return getTodayYmd();
    throw new HttpError(400, message);
  }
  if (val === null || val === '') {
    if (allowNull) return null;
    throw new HttpError(400, message);
  }
  if (typeof val !== 'string') {
    throw new HttpError(400, message);
  }
  const clean = val.trim();
  const m = DATE_YMD_RE.exec(clean);
  if (!m) {
    throw new HttpError(400, message);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new HttpError(400, message);
  }
  return clean;
}

function formatUtcYmd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function advanceDueDate(dateYmd, frequency) {
  const [, yStr, mStr, dStr] = DATE_YMD_RE.exec(dateYmd);
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);

  if (frequency === 'weekly') {
    return formatUtcYmd(new Date(Date.UTC(year, month - 1, day + 7)));
  }
  if (frequency === 'monthly') {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const maxDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(Math.min(day, maxDay)).padStart(2, '0')}`;
  }
  const nextYear = year + 1;
  const maxDay = new Date(Date.UTC(nextYear, month, 0)).getUTCDate();
  return `${nextYear}-${String(month).padStart(2, '0')}-${String(Math.min(day, maxDay)).padStart(2, '0')}`;
}

function buildSummaryPayload(monthStr, partners, categories, transactions) {
  let totalIncome = 0;
  let totalExpense = 0;
  const partnerMap = new Map(
    partners.map((p) => [p.id, { partnerId: p.id, partnerName: p.name, income: 0, expense: 0, net: 0 }])
  );
  const catMap = new Map(
    categories.map((c) => [
      c.id,
      { categoryId: c.id, categoryName: c.name, icon: c.icon, color: c.color, targetAmount: c.targetAmount, spent: 0, income: 0 },
    ])
  );

  for (const tx of transactions) {
    if (tx.type === 'income') totalIncome = roundMoney(totalIncome + tx.amount);
    else totalExpense = roundMoney(totalExpense + tx.amount);

    const pEntry = partnerMap.get(tx.partnerId);
    if (pEntry) {
      if (tx.type === 'income') pEntry.income = roundMoney(pEntry.income + tx.amount);
      else pEntry.expense = roundMoney(pEntry.expense + tx.amount);
      pEntry.net = roundMoney(pEntry.income - pEntry.expense);
    }

    const cEntry = catMap.get(tx.categoryId);
    if (cEntry) {
      if (tx.type === 'income') cEntry.income = roundMoney(cEntry.income + tx.amount);
      else cEntry.spent = roundMoney(cEntry.spent + tx.amount);
    }
  }

  const payload = {
    totalIncome,
    totalExpense,
    netBalance: roundMoney(totalIncome - totalExpense),
    byPartner: Array.from(partnerMap.values()),
    byCategory: Array.from(catMap.values()),
  };
  if (monthStr) payload.month = monthStr;
  return payload;
}

function buildAnalyticsPayload(monthStr, partners, categories, accounts, transactions) {
  let totalIncome = 0;
  let totalExpense = 0;

  const partnerMap = new Map(
    partners.map((p) => [
      p.id,
      {
        partnerId: p.id,
        partnerName: p.name,
        roleLabel: p.roleLabel,
        avatarColor: p.avatarColor,
        income: 0,
        expense: 0,
        net: 0,
        transactionCount: 0,
        incomePercent: 0,
        expensePercent: 0,
      },
    ])
  );

  const catMap = new Map(
    categories.map((c) => [
      c.id,
      {
        categoryId: c.id,
        categoryName: c.name,
        icon: c.icon,
        color: c.color,
        targetAmount: roundMoney(c.targetAmount),
        spent: 0,
        expense: 0,
        income: 0,
        transactionCount: 0,
        expensePercent: 0,
        incomePercent: 0,
      },
    ])
  );

  for (const tx of transactions) {
    const amt = roundMoney(tx.amount);
    if (tx.type === 'income') totalIncome = roundMoney(totalIncome + amt);
    else totalExpense = roundMoney(totalExpense + amt);

    const pEntry = partnerMap.get(tx.partnerId);
    if (pEntry) {
      pEntry.transactionCount += 1;
      if (tx.type === 'income') pEntry.income = roundMoney(pEntry.income + amt);
      else pEntry.expense = roundMoney(pEntry.expense + amt);
      pEntry.net = roundMoney(pEntry.income - pEntry.expense);
    }

    const cEntry = catMap.get(tx.categoryId);
    if (cEntry) {
      cEntry.transactionCount += 1;
      if (tx.type === 'income') {
        cEntry.income = roundMoney(cEntry.income + amt);
      } else {
        cEntry.expense = roundMoney(cEntry.expense + amt);
        cEntry.spent = cEntry.expense;
      }
    }
  }

  const netBalance = roundMoney(totalIncome - totalExpense);
  const savingsRate = totalIncome > 0 ? Math.round((netBalance / totalIncome) * 1000) / 10 : 0;

  const byPartner = Array.from(partnerMap.values()).map((p) => ({
    ...p,
    incomePercent: totalIncome > 0 ? Math.round((p.income / totalIncome) * 1000) / 10 : 0,
    expensePercent: totalExpense > 0 ? Math.round((p.expense / totalExpense) * 1000) / 10 : 0,
  }));

  const byCategory = Array.from(catMap.values())
    .map((c) => ({
      ...c,
      expensePercent: totalExpense > 0 ? Math.round((c.expense / totalExpense) * 1000) / 10 : 0,
      incomePercent: totalIncome > 0 ? Math.round((c.income / totalIncome) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.expense - a.expense || b.income - a.income || a.categoryName.localeCompare(b.categoryName));

  return {
    month: monthStr,
    totals: {
      totalIncome,
      totalExpense,
      netBalance,
      savingsRate,
      transactionCount: transactions.length,
    },
    byCategory,
    byPartner,
    accountsOverview: {
      ...computeAccountTotals(accounts),
      accountsCount: accounts.length,
    },
  };
}

// ============================================================================
// Receipt Parsing & Category Auto-Suggest Helpers
// ============================================================================
const RECEIPT_CATEGORY_GROUPS = [
  {
    receiptKeywords: [
      'kopi', 'coffee', 'cafe', 'kafe', 'starbucks', 'kenangan', 'janji jiwa', 'fore', 'tuku',
      'resto', 'restoran', 'restaurant', 'warung', 'rumah makan', 'makan', 'minum', 'nasi',
      'ayam', 'bakso', 'mie', 'soto', 'sate', 'bistro', 'bakery', 'roti', 'kue', 'boba',
      'indomaret', 'alfamart', 'alfamidi', 'supermarket', 'minimarket', 'superindo', 'hypermart',
      'transmart', 'lotte', 'ranch market', 'grabfood', 'gofood', 'shopeefood', 'grocery',
      'groceries', 'food', 'drink', 'beverage', 'snack', 'dining', 'kuliner',
    ],
    categoryMatchStrong: ['makan', 'minum', 'kuliner', 'kopi', 'coffee', 'food', 'dining', 'f&b', 'belanja', 'grocer'],
    categoryMatchFallback: ['rumah tangga', 'harian', 'kebutuhan', 'household'],
  },
  {
    receiptKeywords: [
      'bensin', 'pertamina', 'spbu', 'shell', 'pertalite', 'pertamax', 'solar', 'fuel', 'bbm',
      'grab', 'gojek', 'goride', 'gocar', 'grabcar', 'grabbike', 'maxim', 'bluebird', 'taksi',
      'taxi', 'ojek', 'parkir', 'parking', 'tol', 'e-toll', 'kereta', 'kai', 'mrt', 'lrt',
      'transjakarta', 'bus', 'transport', 'transportasi',
    ],
    categoryMatchStrong: ['transport', 'bensin', 'kendaraan', 'ojek', 'komuter', 'mobilitas'],
    categoryMatchFallback: ['travel', 'perjalanan', 'rumah tangga'],
  },
  {
    receiptKeywords: [
      'pesawat', 'flight', 'garuda', 'citilink', 'airasia', 'hotel',
      'traveloka', 'tiket', 'agoda', 'airbnb', 'travel', 'liburan', 'wisata',
    ],
    categoryMatchStrong: ['travel', 'liburan', 'perjalanan', 'wisata'],
    categoryMatchFallback: ['transport', 'transportasi'],
  },
  {
    receiptKeywords: [
      'listrik', 'pln', 'token', 'pdam', 'wifi', 'internet', 'indihome', 'biznet', 'firstmedia',
      'myrepublic', 'telkom', 'pulsa', 'paket data', 'telkomsel', 'indosat', 'elpiji', 'gas',
      'sewa', 'kontrakan', 'kos', 'ipl', 'tagihan', 'utility', 'utilities', 'bill', 'ikea',
      'ace hardware', 'mr diy', 'detergen', 'sabun',
    ],
    categoryMatchStrong: ['tagihan', 'listrik', 'utilitas', 'internet', 'bill', 'utilities', 'rumah tangga', 'household', 'rumah', 'home'],
    categoryMatchFallback: ['kebutuhan', 'harian'],
  },
  {
    receiptKeywords: [
      'apotek', 'apotik', 'kimia farma', 'k24', 'century', 'guardian', 'watsons', 'halodoc',
      'alodokter', 'klinik', 'clinic', 'rumah sakit', 'hospital', 'dokter', 'doctor', 'obat',
      'vitamin', 'farmasi', 'pharmacy', 'health', 'medis', 'medical', 'prodia', 'kesehatan',
    ],
    categoryMatchStrong: ['kesehatan', 'health', 'medis', 'medical', 'obat', 'apotek'],
    categoryMatchFallback: ['keluarga', 'rumah tangga'],
  },
  {
    receiptKeywords: [
      'wedding', 'nikah', 'menikah', 'bridal', 'catering', 'undangan', 'souvenir', 'mahar', 'cincin', 'florist',
    ],
    categoryMatchStrong: ['menikah', 'wedding', 'pernikahan', 'acara'],
    categoryMatchFallback: [],
  },
  {
    receiptKeywords: [
      'investasi', 'reksadana', 'saham', 'bibit', 'bareksa', 'ajaib', 'emas', 'antam', 'pegadaian', 'deposito', 'investment',
    ],
    categoryMatchStrong: ['investasi', 'investment', 'tabungan', 'saving'],
    categoryMatchFallback: [],
  },
];

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countKeywordHits(textLower, keywords) {
  let hits = 0;
  for (const kw of keywords) {
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(kw)}(?:$|[^a-z0-9])`, 'i');
    if (re.test(textLower)) hits += 1;
  }
  return hits;
}

function extractReceiptMerchant(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  for (const line of lines) {
    if (/^[\s=*_\-#.~:|/\\]+$/.test(line)) continue;
    const stripped = line.replace(/^[=*#\s-]+|[=*#\s-]+$/g, '').trim();
    if (stripped) return stripped;
  }
  return lines[0];
}

function parseReceiptMoneyToken(raw, { hasCurrencyOrGrouping = false } = {}) {
  if (!raw) return null;
  let cleaned = String(raw)
    .trim()
    .replace(/^(?:rp\.?|idr)\s*/i, '')
    .replace(/(?:,-|\/-|\.-)$/, '')
    .trim();
  if (!cleaned) return null;
  const decMatch = /^(.+?)[.,](\d{1,2})$/.exec(cleaned);
  if (decMatch && decMatch[1]) {
    cleaned = decMatch[1];
  }
  const digits = cleaned.replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const maxLen = hasCurrencyOrGrouping ? 11 : 9;
  if (digits.length > maxLen) return null;
  const num = Number(digits);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function extractAmountsFromLine(line) {
  const sanitized = line
    .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\b\d+(?:-\d+)+\b/g, ' ');
  const found = [];
  const tokenRe = /((?:rp\.?|idr)\s*\d[\d.,]*(?:,-|\/-|\.-)?|\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?(?:,-|\/-|\.-)?|\b\d+(?:[.,]\d{1,2})?)/gi;
  let m;
  while ((m = tokenRe.exec(sanitized)) !== null) {
    const tok = m[1];
    const hasPrefixOrGroup = /(?:rp|idr)/i.test(tok) || /\d{1,3}(?:[.,]\d{3})+/.test(tok);
    const val = parseReceiptMoneyToken(tok, { hasCurrencyOrGrouping: hasPrefixOrGroup });
    if (val !== null && (hasPrefixOrGroup || val >= 100)) {
      found.push(val);
    }
  }
  return found;
}

function parseReceiptAmount(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const ignoreTotalRe = /\b(tunai|cash|kembali|kembalian|change|diskon|discount|hemat|qty|item|items)\b/i;
  const primaryTotalRe = /\b(grand\s*total|total\s*bayar|total\s*belanja|total\s*tagihan|total\s*pembayaran|total\s*harga|amount\s*due|net\s*total)\b/i;
  const secondaryTotalRe = /\b(total|jumlah|tagihan|bayar)\b/i;
  const subTotalRe = /\bsub[\s-]*total\b/i;

  const primaryCandidates = [];
  const secondaryCandidates = [];
  const currencyCandidates = [];
  const allCandidates = [];

  for (const line of lines) {
    const amounts = extractAmountsFromLine(line);
    if (amounts.length === 0) continue;

    const isIgnored = ignoreTotalRe.test(line);
    if (!isIgnored && primaryTotalRe.test(line)) {
      primaryCandidates.push(...amounts);
    } else if (!isIgnored && !subTotalRe.test(line) && secondaryTotalRe.test(line)) {
      secondaryCandidates.push(...amounts);
    }

    if (!isIgnored) {
      const currencyRe = /(?:rp\.?|idr)\s*(\d[\d.,]*(?:,-|\/-|\.-)?)/gi;
      let cm;
      while ((cm = currencyRe.exec(line)) !== null) {
        const val = parseReceiptMoneyToken(cm[1], { hasCurrencyOrGrouping: true });
        if (val !== null) currencyCandidates.push(val);
      }
      allCandidates.push(...amounts);
    }
  }

  if (primaryCandidates.length > 0) return Math.max(...primaryCandidates);
  if (secondaryCandidates.length > 0) return Math.max(...secondaryCandidates);
  if (currencyCandidates.length > 0) return Math.max(...currencyCandidates);
  if (allCandidates.length > 0) return Math.max(...allCandidates);

  // Last resort across all lines if every line matched ignore keywords
  const fallback = lines.flatMap(extractAmountsFromLine);
  return fallback.length > 0 ? Math.max(...fallback) : null;
}

function suggestReceiptCategory(text, categories) {
  if (!categories || categories.length === 0) {
    return { suggestedCategoryId: null, suggestedCategoryName: null };
  }
  const textLower = String(text).toLowerCase();
  const groupHits = RECEIPT_CATEGORY_GROUPS.map((group) => ({
    group,
    hits: countKeywordHits(textLower, group.receiptKeywords),
  })).filter((g) => g.hits > 0);

  let best = null;
  let bestScore = 0;

  for (const cat of categories) {
    const catLower = String(cat.name || '').toLowerCase();
    let score = 0;

    for (const { group, hits } of groupHits) {
      if (group.categoryMatchStrong.some((kw) => catLower.includes(kw))) {
        score += hits * 10;
      } else if (group.categoryMatchFallback.some((kw) => catLower.includes(kw))) {
        score += hits * 3;
      }
    }

    const catWords = catLower
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !['dan', 'and', 'untuk', 'for'].includes(w));
    for (const word of catWords) {
      if (countKeywordHits(textLower, [word]) > 0) {
        score += 12;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }

  if (!best) {
    return { suggestedCategoryId: null, suggestedCategoryName: null };
  }
  return { suggestedCategoryId: best.id, suggestedCategoryName: best.name };
}

// ============================================================================
// Storage Adapter (PostgreSQL if DATABASE_URL is set, else In-Memory Store)
// ============================================================================
const mem = {
  couples: new Map(),
  partners: new Map(), // partnerId -> partner
  tokens: new Map(), // token -> partnerId
  categories: new Map(), // coupleId -> Category[]
  accounts: new Map(), // coupleId -> Account[]
  transactions: new Map(), // coupleId -> Transaction[]
  transfers: new Map(), // coupleId -> AccountTransfer[]
  budgets: new Map(), // coupleId -> Budget[]
  notes: new Map(), // coupleId -> Note[]
  recurringRules: new Map(), // coupleId -> RecurringRule[]
  debtLoans: new Map(), // coupleId -> DebtLoan[]
  quickPresets: new Map(), // coupleId -> QuickPreset[]
  emailOtps: new Map(), // `${email}:${purpose}` -> { email, purpose, codeHash, attempts, expiresAtMs, createdAtMs }
};

const usePg = Boolean(process.env.DATABASE_URL);
const pool = usePg
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
  : null;

async function initDb() {
  if (!pool) return;
  const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
}

async function withPgTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function hydrateMemTx(tx, coupleId) {
  const partner = mem.partners.get(tx.partnerId);
  const cat = (mem.categories.get(coupleId) || []).find((c) => c.id === tx.categoryId);
  const acc = tx.accountId ? (mem.accounts.get(coupleId) || []).find((a) => a.id === tx.accountId) : null;
  return {
    id: tx.id,
    coupleId: tx.coupleId,
    partnerId: tx.partnerId,
    partnerName: partner ? partner.name : tx.partnerName,
    categoryId: tx.categoryId,
    categoryName: cat ? cat.name : tx.categoryName,
    categoryIcon: cat ? cat.icon : tx.categoryIcon,
    accountId: acc ? acc.id : null,
    accountName: acc ? acc.name : null,
    accountIcon: acc ? acc.icon : null,
    type: tx.type,
    amount: roundMoney(tx.amount),
    note: tx.note,
    occurredAt: tx.occurredAt,
  };
}

function hydrateMemAccount(acc) {
  const owner = acc.ownerPartnerId ? mem.partners.get(acc.ownerPartnerId) : null;
  return {
    id: acc.id,
    coupleId: acc.coupleId,
    ownerPartnerId: acc.isShared ? null : acc.ownerPartnerId,
    ownerPartnerName: acc.isShared || !owner ? null : owner.name,
    name: acc.name,
    accountType: acc.accountType,
    isShared: acc.isShared,
    initialBalance: roundMoney(acc.initialBalance),
    balance: roundMoney(acc.balance),
    icon: acc.icon,
    color: acc.color,
    createdAt: acc.createdAt,
  };
}

function hydrateMemNote(note) {
  const author = mem.partners.get(note.authorPartnerId);
  return {
    id: note.id,
    coupleId: note.coupleId,
    authorPartnerId: note.authorPartnerId,
    authorName: author ? author.name : note.authorName,
    categoryId: note.categoryId,
    title: note.title,
    content: note.content,
    isPinned: note.isPinned,
    updatedAt: note.updatedAt,
  };
}

function hydrateMemTransfer(tr, coupleId) {
  const partner = mem.partners.get(tr.partnerId);
  const accounts = mem.accounts.get(coupleId) || [];
  const fromAcc = tr.fromAccountId ? accounts.find((a) => a.id === tr.fromAccountId) : null;
  const toAcc = tr.toAccountId ? accounts.find((a) => a.id === tr.toAccountId) : null;
  return {
    id: tr.id,
    coupleId: tr.coupleId,
    partnerId: tr.partnerId,
    partnerName: partner ? partner.name : tr.partnerName,
    fromAccountId: fromAcc ? fromAcc.id : null,
    fromAccountName: fromAcc ? fromAcc.name : null,
    fromAccountIcon: fromAcc ? fromAcc.icon : null,
    toAccountId: toAcc ? toAcc.id : null,
    toAccountName: toAcc ? toAcc.name : null,
    toAccountIcon: toAcc ? toAcc.icon : null,
    amount: roundMoney(tr.amount),
    note: tr.note,
    occurredAt: tr.occurredAt,
    createdAt: tr.createdAt,
  };
}

function hydrateMemRecurringRule(rule, coupleId) {
  const creator = mem.partners.get(rule.createdBy);
  const cat = (mem.categories.get(coupleId) || []).find((c) => c.id === rule.categoryId);
  const acc = rule.accountId ? (mem.accounts.get(coupleId) || []).find((a) => a.id === rule.accountId) : null;
  return {
    id: rule.id,
    coupleId: rule.coupleId,
    title: rule.title,
    type: rule.type,
    amount: roundMoney(rule.amount),
    categoryId: rule.categoryId,
    categoryName: cat ? cat.name : rule.categoryName || '',
    categoryIcon: cat ? cat.icon : rule.categoryIcon || '✨',
    accountId: acc ? acc.id : null,
    accountName: acc ? acc.name : null,
    accountIcon: acc ? acc.icon : null,
    frequency: rule.frequency,
    nextDueDate: rule.nextDueDate,
    active: Boolean(rule.active),
    createdBy: rule.createdBy,
    createdByName: creator ? creator.name : rule.createdByName || '',
    createdAt: rule.createdAt,
  };
}

function hydrateMemDebtLoan(debt) {
  const creator = mem.partners.get(debt.createdBy);
  const amount = roundMoney(debt.amount);
  const paidAmount = roundMoney(debt.paidAmount);
  return {
    id: debt.id,
    coupleId: debt.coupleId,
    personName: debt.personName,
    direction: debt.direction,
    amount,
    paidAmount,
    remainingAmount: roundMoney(Math.max(0, amount - paidAmount)),
    note: debt.note,
    dueDate: debt.dueDate ?? null,
    settled: Boolean(debt.settled),
    createdBy: debt.createdBy,
    createdByName: creator ? creator.name : debt.createdByName || '',
    createdAt: debt.createdAt,
  };
}

function hydrateMemQuickPreset(preset, coupleId) {
  const cat = preset.categoryId
    ? (mem.categories.get(coupleId) || []).find((c) => c.id === preset.categoryId)
    : null;
  const acc = preset.accountId
    ? (mem.accounts.get(coupleId) || []).find((a) => a.id === preset.accountId)
    : null;
  return {
    id: preset.id,
    coupleId: preset.coupleId,
    label: preset.label,
    type: preset.type,
    amount: roundMoney(preset.amount),
    categoryId: cat ? cat.id : null,
    categoryName: cat ? cat.name : null,
    categoryIcon: cat ? cat.icon : null,
    accountId: acc ? acc.id : null,
    accountName: acc ? acc.name : null,
    accountIcon: acc ? acc.icon : null,
    note: preset.note,
    createdAt: preset.createdAt,
  };
}

function resolveDefaultPresetCategory(categories, keyword) {
  if (!categories || categories.length === 0) return null;
  const kwLower = String(keyword || '').toLowerCase();
  const match = categories.find((c) => String(c.name || '').toLowerCase().includes(kwLower));
  return (match || categories[0]).id;
}

async function seedCoupleDefaultsPg(client, coupleId) {
  const seededCategories = [];
  for (const cat of DEFAULT_CATEGORIES) {
    const catId = randomUUID();
    await client.query(
      'INSERT INTO categories(id, couple_id, name, icon, color, target_amount, is_default) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [catId, coupleId, cat.name, cat.icon, cat.color, cat.targetAmount, cat.isDefault]
    );
    seededCategories.push({ id: catId, name: cat.name });
  }
  if (seededCategories.length > 0) {
    for (const preset of DEFAULT_QUICK_PRESETS) {
      const catId = resolveDefaultPresetCategory(seededCategories, preset.categoryKeyword);
      await client.query(
        'INSERT INTO quick_presets(id, couple_id, label, type, amount, category_id, account_id, note) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [randomUUID(), coupleId, preset.label, preset.type, preset.amount, catId, null, preset.note]
      );
    }
  }
}

function seedCoupleDefaultsMem(coupleId, nowMs) {
  const cats = DEFAULT_CATEGORIES.map((cat, idx) => ({
    id: randomUUID(),
    coupleId,
    ...cat,
    createdAtMs: nowMs + idx,
  }));
  mem.categories.set(coupleId, cats);
  mem.accounts.set(coupleId, []);
  mem.transactions.set(coupleId, []);
  mem.transfers.set(coupleId, []);
  mem.budgets.set(coupleId, []);
  mem.notes.set(coupleId, []);
  mem.recurringRules.set(coupleId, []);
  mem.debtLoans.set(coupleId, []);
  const seededPresets =
    cats.length > 0
      ? DEFAULT_QUICK_PRESETS.map((preset, idx) => ({
          id: randomUUID(),
          coupleId,
          label: preset.label,
          type: preset.type,
          amount: preset.amount,
          categoryId: resolveDefaultPresetCategory(cats, preset.categoryKeyword),
          accountId: null,
          note: preset.note,
          createdAt: new Date(nowMs + idx).toISOString(),
          createdAtMs: nowMs + idx,
        }))
      : [];
  mem.quickPresets.set(coupleId, seededPresets);
}

const makeInviteCode = () => randomBytes(3).toString('hex').toUpperCase();
const makeToken = () => randomBytes(24).toString('base64url');

const JWT_SECRET = process.env.JWT_SECRET || '';
function verifySharedJwt(token) {
  if (!JWT_SECRET) return null;
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = createHmac('sha256', JWT_SECRET).update(h + '.' + p).digest('base64url');
  try {
    if (!timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
  } catch { return null; }
  let payload; try { payload = JSON.parse(Buffer.from(p, 'base64url').toString()); } catch { return null; }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

const authPartner = asyncHandler(async (req, res, next) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Token pasangan wajib disertakan.' });

  // Try shared backend JWT first
  const jwtPayload = verifySharedJwt(token);
  if (jwtPayload && jwtPayload.email) {
    if (pool) {
      const r = await pool.query('SELECT * FROM partners WHERE email = $1', [jwtPayload.email.toLowerCase()]);
      if (r.rowCount) {
        req.partner = {
          id: r.rows[0].id,
          coupleId: r.rows[0].couple_id,
          name: r.rows[0].name,
          roleLabel: r.rows[0].role_label,
          avatarColor: r.rows[0].avatar_color,
        };
        return next();
      }
    }
  }

  if (pool) {
    const r = await pool.query('SELECT * FROM partners WHERE token = $1', [token]);
    if (!r.rowCount) return res.status(401).json({ error: 'Sesi token tidak valid.' });
    req.partner = {
      id: r.rows[0].id,
      coupleId: r.rows[0].couple_id,
      name: r.rows[0].name,
      roleLabel: r.rows[0].role_label,
      avatarColor: r.rows[0].avatar_color,
    };
    return next();
  }

  const partnerId = mem.tokens.get(token);
  const partner = partnerId ? mem.partners.get(partnerId) : null;
  if (!partner) return res.status(401).json({ error: 'Sesi token tidak valid.' });
  req.partner = {
    id: partner.id,
    coupleId: partner.coupleId,
    name: partner.name,
    roleLabel: partner.roleLabel,
    avatarColor: partner.avatarColor,
  };
  next();
});

app.get(
  '/api/health',
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, app: 'DuaSaku API', storage: pool ? 'postgresql' : 'memory' });
  })
);

// Create new couple space (Partner A)
app.post(
  '/api/couples/create',
  asyncHandler(async (req, res) => {
    const { coupleName, partnerName } = req.body || {};
    if (!partnerName || String(partnerName).trim().length < 2) {
      return res.status(400).json({ error: 'Nama Anda wajib diisi (minimal 2 karakter).' });
    }
    const coupleId = randomUUID();
    const partnerId = randomUUID();
    const token = makeToken();
    const inviteCode = makeInviteCode();
    const cleanCoupleName = String(coupleName || `Dompet ${partnerName}`).trim();
    const cleanPartnerName = String(partnerName).trim();

    if (pool) {
      await withPgTx(async (client) => {
        await client.query(
          'INSERT INTO couples(id, couple_name, invite_code) VALUES($1,$2,$3)',
          [coupleId, cleanCoupleName, inviteCode]
        );
        await client.query(
          'INSERT INTO partners(id, couple_id, name, role_label, avatar_color, token) VALUES($1,$2,$3,$4,$5,$6)',
          [partnerId, coupleId, cleanPartnerName, 'Partner A', PARTNER_A_COLOR, token]
        );
        await seedCoupleDefaultsPg(client, coupleId);
      });
    } else {
      const nowMs = Date.now();
      mem.couples.set(coupleId, { id: coupleId, coupleName: cleanCoupleName, inviteCode });
      const partner = {
        id: partnerId,
        coupleId,
        name: cleanPartnerName,
        roleLabel: 'Partner A',
        avatarColor: PARTNER_A_COLOR,
        createdAtMs: nowMs,
      };
      mem.partners.set(partnerId, partner);
      mem.tokens.set(token, partnerId);
      seedCoupleDefaultsMem(coupleId, nowMs);
    }

    res.status(201).json({
      token,
      couple: { id: coupleId, coupleName: cleanCoupleName, inviteCode },
      partner: { id: partnerId, coupleId, name: cleanPartnerName, roleLabel: 'Partner A', avatarColor: PARTNER_A_COLOR },
    });
  })
);

// Join existing couple space via Invite Code (Partner B)
app.post(
  '/api/couples/join',
  asyncHandler(async (req, res) => {
    const { inviteCode, partnerName } = req.body || {};
    const code = String(inviteCode || '').trim().toUpperCase();
    if (!code || !partnerName || String(partnerName).trim().length < 2) {
      return res.status(400).json({ error: 'Kode undangan dan nama pasangan wajib diisi.' });
    }
    const cleanName = String(partnerName).trim();
    const partnerId = randomUUID();
    const token = makeToken();

    if (pool) {
      const cRes = await pool.query('SELECT * FROM couples WHERE invite_code = $1', [code]);
      if (!cRes.rowCount) return res.status(404).json({ error: 'Kode undangan pasangan tidak ditemukan.' });
      const couple = cRes.rows[0];
      await pool.query(
        'INSERT INTO partners(id, couple_id, name, role_label, avatar_color, token) VALUES($1,$2,$3,$4,$5,$6)',
        [partnerId, couple.id, cleanName, 'Partner B', PARTNER_B_COLOR, token]
      );
      return res.status(201).json({
        token,
        couple: { id: couple.id, coupleName: couple.couple_name, inviteCode: couple.invite_code },
        partner: { id: partnerId, coupleId: couple.id, name: cleanName, roleLabel: 'Partner B', avatarColor: PARTNER_B_COLOR },
      });
    }

    const couple = Array.from(mem.couples.values()).find((c) => c.inviteCode === code);
    if (!couple) return res.status(404).json({ error: 'Kode undangan pasangan tidak ditemukan.' });
    const partner = {
      id: partnerId,
      coupleId: couple.id,
      name: cleanName,
      roleLabel: 'Partner B',
      avatarColor: PARTNER_B_COLOR,
      createdAtMs: Date.now(),
    };
    mem.partners.set(partnerId, partner);
    mem.tokens.set(token, partnerId);
    res.status(201).json({
      token,
      couple,
      partner: {
        id: partner.id,
        coupleId: partner.coupleId,
        name: partner.name,
        roleLabel: partner.roleLabel,
        avatarColor: partner.avatarColor,
      },
    });
  })
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hexHash] = stored.split(':');
  if (!salt || !hexHash) return false;
  const expected = Buffer.from(hexHash, 'hex');
  const actual = scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

const OTP_RE = /^\d{6}$/;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function hashOtp(cleanEmail, purpose, code) {
  return createHash('sha256').update(`${cleanEmail}:${purpose}:${code}`).digest('hex');
}

async function sendOtpEmail(email, code, purpose) {
  const isReset = purpose === 'reset_password';
  const subject = isReset
    ? 'Kode Reset Password DuaSaku'
    : 'Kode Verifikasi Pendaftaran DuaSaku';
  const actionLabel = isReset ? 'mereset password akun' : 'mendaftarkan akun';
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#2E231D;">
      <h2 style="margin:0 0 12px;color:#C86446;">DuaSaku</h2>
      <p style="margin:0 0 16px;">Gunakan kode OTP 6 digit berikut untuk ${actionLabel} DuaSaku Anda:</p>
      <div style="font-size:28px;font-weight:800;letter-spacing:6px;padding:14px 20px;background:#FBF7F2;border:1px solid #E5D7CA;border-radius:10px;text-align:center;margin-bottom:16px;">
        ${code}
      </div>
      <p style="margin:0;font-size:13px;color:#6E5A4F;">Kode ini berlaku selama 10 menit. Jangan bagikan kode ini kepada siapa pun.</p>
    </div>
  `;

  const showInApp = process.env.NODE_ENV !== 'production' || process.env.SHOW_DEV_OTP === 'true';
  if (process.env.RESEND_API_KEY) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'DuaSaku <onboarding@resend.dev>',
        to: [email],
        subject,
        html,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.error(`[OTP EMAIL ERROR] ${resp.status} ${errBody}`);
      // Fall back to in-app OTP if email fails
      if (showInApp) {
        console.log(`[OTP IN-APP FALLBACK] ${purpose} ${email}: ${code}`);
        return { sent: true, devOtp: code };
      }
      throw new HttpError(502, 'Gagal mengirim email OTP. Silakan coba lagi.');
    }
    return { sent: true, devOtp: showInApp ? code : undefined };
  }

  console.log(`[OTP DEV] ${purpose} ${email}: ${code}`);
  return {
    sent: true,
    devOtp: showInApp ? code : undefined,
  };
}

async function verifyAndConsumeOtp(cleanEmail, purpose, otpCode) {
  const cleanOtp = String(otpCode || '').trim();
  if (!OTP_RE.test(cleanOtp)) {
    throw new HttpError(400, 'Kode OTP 6 digit wajib diisi.');
  }
  const candidateHash = hashOtp(cleanEmail, purpose, cleanOtp);

  if (pool) {
    const otpRes = await pool.query(
      'SELECT code_hash, attempts, expires_at FROM email_otps WHERE email = $1 AND purpose = $2',
      [cleanEmail, purpose]
    );
    if (!otpRes.rowCount) {
      throw new HttpError(400, 'Kode OTP belum dikirim atau sudah kedaluwarsa.');
    }
    const row = otpRes.rows[0];
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      throw new HttpError(429, 'Terlalu banyak percobaan OTP. Silakan minta kode baru.');
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await pool.query('DELETE FROM email_otps WHERE email = $1 AND purpose = $2', [
        cleanEmail,
        purpose,
      ]);
      throw new HttpError(400, 'Kode OTP sudah kedaluwarsa. Silakan minta kode baru.');
    }
    const expectedBuf = Buffer.from(row.code_hash, 'hex');
    const actualBuf = Buffer.from(candidateHash, 'hex');
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      await pool.query(
        'UPDATE email_otps SET attempts = attempts + 1 WHERE email = $1 AND purpose = $2',
        [cleanEmail, purpose]
      );
      throw new HttpError(400, 'Kode OTP tidak sesuai.');
    }
    await pool.query('DELETE FROM email_otps WHERE email = $1 AND purpose = $2', [
      cleanEmail,
      purpose,
    ]);
    return;
  }

  const key = `${cleanEmail}:${purpose}`;
  const entry = mem.emailOtps.get(key);
  if (!entry) {
    throw new HttpError(400, 'Kode OTP belum dikirim atau sudah kedaluwarsa.');
  }
  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    throw new HttpError(429, 'Terlalu banyak percobaan OTP. Silakan minta kode baru.');
  }
  if (entry.expiresAtMs <= Date.now()) {
    mem.emailOtps.delete(key);
    throw new HttpError(400, 'Kode OTP sudah kedaluwarsa. Silakan minta kode baru.');
  }
  const expectedBuf = Buffer.from(entry.codeHash, 'hex');
  const actualBuf = Buffer.from(candidateHash, 'hex');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    entry.attempts += 1;
    throw new HttpError(400, 'Kode OTP tidak sesuai.');
  }
  mem.emailOtps.delete(key);
}

// Send 6-digit email OTP for registration or password reset
app.post(
  '/api/auth/send-otp',
  asyncHandler(async (req, res) => {
    const { email, purpose } = req.body || {};
    const cleanEmail = normalizeEmail(email);
    if (!EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'Format email tidak valid.' });
    }
    if (purpose !== 'register' && purpose !== 'reset_password') {
      return res.status(400).json({ error: 'Purpose OTP harus register atau reset_password.' });
    }

    const nowMs = Date.now();
    const expiresAtMs = nowMs + OTP_TTL_MS;
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const codeHash = hashOtp(cleanEmail, purpose, code);

    if (pool) {
      const existingPartner = await pool.query(
        'SELECT id FROM partners WHERE LOWER(email) = $1',
        [cleanEmail]
      );
      if (purpose === 'register' && existingPartner.rowCount > 0) {
        return res.status(409).json({ error: 'Email sudah terdaftar. Silakan masuk dengan akun Anda.' });
      }
      if (purpose === 'reset_password' && existingPartner.rowCount === 0) {
        return res.status(404).json({ error: 'Email belum terdaftar di DuaSaku.' });
      }

      const existingOtp = await pool.query(
        'SELECT created_at FROM email_otps WHERE email = $1 AND purpose = $2',
        [cleanEmail, purpose]
      );
      if (existingOtp.rowCount > 0) {
        const createdMs = new Date(existingOtp.rows[0].created_at).getTime();
        if (nowMs - createdMs < OTP_COOLDOWN_MS) {
          return res.status(429).json({ error: 'Tunggu 30 detik sebelum meminta kode OTP baru.' });
        }
      }

      await pool.query(
        `INSERT INTO email_otps(email, purpose, code_hash, attempts, expires_at, created_at)
         VALUES($1, $2, $3, 0, $4, now())
         ON CONFLICT (email, purpose) DO UPDATE
         SET code_hash = EXCLUDED.code_hash,
             attempts = 0,
             expires_at = EXCLUDED.expires_at,
             created_at = now()`,
        [cleanEmail, purpose, codeHash, new Date(expiresAtMs).toISOString()]
      );
    } else {
      const existingPartner = Array.from(mem.partners.values()).find((p) => p.email === cleanEmail);
      if (purpose === 'register' && existingPartner) {
        return res.status(409).json({ error: 'Email sudah terdaftar. Silakan masuk dengan akun Anda.' });
      }
      if (purpose === 'reset_password' && !existingPartner) {
        return res.status(404).json({ error: 'Email belum terdaftar di DuaSaku.' });
      }

      const key = `${cleanEmail}:${purpose}`;
      const existingOtp = mem.emailOtps.get(key);
      if (existingOtp && nowMs - existingOtp.createdAtMs < OTP_COOLDOWN_MS) {
        return res.status(429).json({ error: 'Tunggu 30 detik sebelum meminta kode OTP baru.' });
      }
      mem.emailOtps.set(key, {
        email: cleanEmail,
        purpose,
        codeHash,
        attempts: 0,
        expiresAtMs,
        createdAtMs: nowMs,
      });
    }

    const emailResult = await sendOtpEmail(cleanEmail, code, purpose);
    res.json({
      ok: true,
      message: 'Kode OTP dikirim ke email Anda.',
      ...(emailResult.devOtp ? { devOtp: emailResult.devOtp } : {}),
    });
  })
);

// Register with email & password (creates new couple space or joins existing via inviteCode)
app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    const { email, password, partnerName, mode = 'create', coupleName, inviteCode, otpCode } =
      req.body || {};
    const cleanEmail = normalizeEmail(email);
    if (!EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'Format email tidak valid.' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter.' });
    }
    const cleanPartnerName = String(partnerName || '').trim();
    if (cleanPartnerName.length < 2) {
      return res.status(400).json({ error: 'Nama Anda wajib diisi (minimal 2 karakter).' });
    }
    if (mode !== 'create' && mode !== 'join') {
      return res.status(400).json({ error: 'Mode registrasi harus create atau join.' });
    }
    const cleanOtp = String(otpCode || '').trim();
    if (!OTP_RE.test(cleanOtp)) {
      return res.status(400).json({ error: 'Kode OTP 6 digit wajib diisi.' });
    }

    const passwordHash = hashPassword(password);
    const partnerId = randomUUID();
    const token = makeToken();

    if (pool) {
      const existing = await pool.query('SELECT id FROM partners WHERE LOWER(email) = $1', [cleanEmail]);
      if (existing.rowCount > 0) {
        return res.status(409).json({ error: 'Email sudah terdaftar. Silakan masuk dengan akun Anda.' });
      }

      if (mode === 'join') {
        const code = String(inviteCode || '').trim().toUpperCase();
        if (!code) {
          return res.status(400).json({ error: 'Kode undangan pasangan wajib diisi.' });
        }
        const cRes = await pool.query('SELECT * FROM couples WHERE invite_code = $1', [code]);
        if (!cRes.rowCount) {
          return res.status(404).json({ error: 'Kode undangan pasangan tidak ditemukan.' });
        }
        await verifyAndConsumeOtp(cleanEmail, 'register', cleanOtp);
        const couple = cRes.rows[0];
        await pool.query(
          'INSERT INTO partners(id, couple_id, name, role_label, avatar_color, token, email, password_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [partnerId, couple.id, cleanPartnerName, 'Partner B', PARTNER_B_COLOR, token, cleanEmail, passwordHash]
        );
        return res.status(201).json({
          token,
          couple: { id: couple.id, coupleName: couple.couple_name, inviteCode: couple.invite_code },
          partner: {
            id: partnerId,
            coupleId: couple.id,
            name: cleanPartnerName,
            roleLabel: 'Partner B',
            avatarColor: PARTNER_B_COLOR,
          },
        });
      }

      await verifyAndConsumeOtp(cleanEmail, 'register', cleanOtp);
      const coupleId = randomUUID();
      const newInviteCode = makeInviteCode();
      const cleanCoupleName = String(coupleName || `Dompet ${cleanPartnerName}`).trim();
      await withPgTx(async (client) => {
        await client.query(
          'INSERT INTO couples(id, couple_name, invite_code) VALUES($1,$2,$3)',
          [coupleId, cleanCoupleName, newInviteCode]
        );
        await client.query(
          'INSERT INTO partners(id, couple_id, name, role_label, avatar_color, token, email, password_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [partnerId, coupleId, cleanPartnerName, 'Partner A', PARTNER_A_COLOR, token, cleanEmail, passwordHash]
        );
        await seedCoupleDefaultsPg(client, coupleId);
      });
      return res.status(201).json({
        token,
        couple: { id: coupleId, coupleName: cleanCoupleName, inviteCode: newInviteCode },
        partner: {
          id: partnerId,
          coupleId,
          name: cleanPartnerName,
          roleLabel: 'Partner A',
          avatarColor: PARTNER_A_COLOR,
        },
      });
    }

    const dupMem = Array.from(mem.partners.values()).find((p) => p.email === cleanEmail);
    if (dupMem) {
      return res.status(409).json({ error: 'Email sudah terdaftar. Silakan masuk dengan akun Anda.' });
    }

    if (mode === 'join') {
      const code = String(inviteCode || '').trim().toUpperCase();
      if (!code) {
        return res.status(400).json({ error: 'Kode undangan pasangan wajib diisi.' });
      }
      const couple = Array.from(mem.couples.values()).find((c) => c.inviteCode === code);
      if (!couple) {
        return res.status(404).json({ error: 'Kode undangan pasangan tidak ditemukan.' });
      }
      await verifyAndConsumeOtp(cleanEmail, 'register', cleanOtp);
      const partner = {
        id: partnerId,
        coupleId: couple.id,
        name: cleanPartnerName,
        roleLabel: 'Partner B',
        avatarColor: PARTNER_B_COLOR,
        email: cleanEmail,
        passwordHash,
        createdAtMs: Date.now(),
      };
      mem.partners.set(partnerId, partner);
      mem.tokens.set(token, partnerId);
      return res.status(201).json({
        token,
        couple,
        partner: {
          id: partner.id,
          coupleId: partner.coupleId,
          name: partner.name,
          roleLabel: partner.roleLabel,
          avatarColor: partner.avatarColor,
        },
      });
    }

    await verifyAndConsumeOtp(cleanEmail, 'register', cleanOtp);
    const coupleId = randomUUID();
    const newInviteCode = makeInviteCode();
    const cleanCoupleName = String(coupleName || `Dompet ${cleanPartnerName}`).trim();
    const nowMs = Date.now();
    const couple = { id: coupleId, coupleName: cleanCoupleName, inviteCode: newInviteCode };
    mem.couples.set(coupleId, couple);
    const partner = {
      id: partnerId,
      coupleId,
      name: cleanPartnerName,
      roleLabel: 'Partner A',
      avatarColor: PARTNER_A_COLOR,
      email: cleanEmail,
      passwordHash,
      createdAtMs: nowMs,
    };
    mem.partners.set(partnerId, partner);
    mem.tokens.set(token, partnerId);
    seedCoupleDefaultsMem(coupleId, nowMs);

    res.status(201).json({
      token,
      couple,
      partner: {
        id: partner.id,
        coupleId: partner.coupleId,
        name: partner.name,
        roleLabel: partner.roleLabel,
        avatarColor: partner.avatarColor,
      },
    });
  })
);

// Reset password using 6-digit email OTP
app.post(
  '/api/auth/reset-password',
  asyncHandler(async (req, res) => {
    const { email, otpCode, newPassword } = req.body || {};
    const cleanEmail = normalizeEmail(email);
    if (!EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'Format email tidak valid.' });
    }
    const cleanOtp = String(otpCode || '').trim();
    if (!OTP_RE.test(cleanOtp)) {
      return res.status(400).json({ error: 'Kode OTP 6 digit wajib diisi.' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
    }

    const newHash = hashPassword(newPassword);
    const newToken = makeToken();

    if (pool) {
      const pRes = await pool.query('SELECT id FROM partners WHERE LOWER(email) = $1', [cleanEmail]);
      if (!pRes.rowCount) {
        return res.status(404).json({ error: 'Email belum terdaftar di DuaSaku.' });
      }
      await verifyAndConsumeOtp(cleanEmail, 'reset_password', cleanOtp);
      await pool.query('UPDATE partners SET password_hash = $1, token = $2 WHERE id = $3', [
        newHash,
        newToken,
        pRes.rows[0].id,
      ]);
      return res.json({
        ok: true,
        message: 'Password berhasil diperbarui. Silakan masuk.',
      });
    }

    const partner = Array.from(mem.partners.values()).find((p) => p.email === cleanEmail);
    if (!partner) {
      return res.status(404).json({ error: 'Email belum terdaftar di DuaSaku.' });
    }
    await verifyAndConsumeOtp(cleanEmail, 'reset_password', cleanOtp);
    partner.passwordHash = newHash;
    for (const [tok, pid] of mem.tokens.entries()) {
      if (pid === partner.id) mem.tokens.delete(tok);
    }
    mem.tokens.set(newToken, partner.id);

    res.json({
      ok: true,
      message: 'Password berhasil diperbarui. Silakan masuk.',
    });
  })
);

// Login with email & password
app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    const cleanEmail = normalizeEmail(email);
    if (!EMAIL_RE.test(cleanEmail) || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi.' });
    }

    const newToken = makeToken();

    if (pool) {
      const pRes = await pool.query('SELECT * FROM partners WHERE LOWER(email) = $1', [cleanEmail]);
      if (!pRes.rowCount) {
        return res.status(401).json({ error: 'Email atau password salah.' });
      }
      const pRow = pRes.rows[0];
      if (!verifyPassword(password, pRow.password_hash)) {
        return res.status(401).json({ error: 'Email atau password salah.' });
      }
      await pool.query('UPDATE partners SET token = $1 WHERE id = $2', [newToken, pRow.id]);
      const cRes = await pool.query('SELECT * FROM couples WHERE id = $1', [pRow.couple_id]);
      if (!cRes.rowCount) {
        return res.status(404).json({ error: 'Ruang pasangan tidak ditemukan.' });
      }
      const cRow = cRes.rows[0];
      return res.json({
        token: newToken,
        couple: { id: cRow.id, coupleName: cRow.couple_name, inviteCode: cRow.invite_code },
        partner: {
          id: pRow.id,
          coupleId: pRow.couple_id,
          name: pRow.name,
          roleLabel: pRow.role_label,
          avatarColor: pRow.avatar_color,
        },
      });
    }

    const partner = Array.from(mem.partners.values()).find((p) => p.email === cleanEmail);
    if (!partner || !verifyPassword(password, partner.passwordHash)) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }
    const couple = mem.couples.get(partner.coupleId);
    if (!couple) {
      return res.status(404).json({ error: 'Ruang pasangan tidak ditemukan.' });
    }
    for (const [tok, pid] of mem.tokens.entries()) {
      if (pid === partner.id) mem.tokens.delete(tok);
    }
    mem.tokens.set(newToken, partner.id);

    res.json({
      token: newToken,
      couple,
      partner: {
        id: partner.id,
        coupleId: partner.coupleId,
        name: partner.name,
        roleLabel: partner.roleLabel,
        avatarColor: partner.avatarColor,
      },
    });
  })
);

// Get couple space details + partners
app.get(
  '/api/couple',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    if (pool) {
      const [cRes, pRes] = await Promise.all([
        pool.query('SELECT id, couple_name AS "coupleName", invite_code AS "inviteCode" FROM couples WHERE id=$1', [coupleId]),
        pool.query(
          'SELECT id, couple_id AS "coupleId", name, role_label AS "roleLabel", avatar_color AS "avatarColor" FROM partners WHERE couple_id=$1 ORDER BY created_at ASC',
          [coupleId]
        ),
      ]);
      return res.json({ ...cRes.rows[0], partners: pRes.rows });
    }
    const couple = mem.couples.get(coupleId);
    const partners = Array.from(mem.partners.values())
      .filter((p) => p.coupleId === coupleId)
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .map(({ id, coupleId: cId, name, roleLabel, avatarColor }) => ({ id, coupleId: cId, name, roleLabel, avatarColor }));
    res.json({ ...couple, partners });
  })
);

// Update couple profile (coupleName and/or requesting partner's display name)
app.patch(
  '/api/couple',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId, id: partnerId } = req.partner;
    const { coupleName, partnerName, name } = req.body || {};
    const rawPartnerName = partnerName !== undefined ? partnerName : name;

    if (coupleName === undefined && rawPartnerName === undefined) {
      throw new HttpError(400, 'Minimal salah satu dari coupleName atau partnerName wajib diisi.');
    }

    let cleanCoupleName;
    if (coupleName !== undefined) {
      cleanCoupleName = String(coupleName ?? '').trim();
      if (cleanCoupleName.length < 2) {
        throw new HttpError(400, 'Nama ruang pasangan minimal 2 karakter.');
      }
    }

    let cleanPartnerName;
    if (rawPartnerName !== undefined) {
      cleanPartnerName = String(rawPartnerName ?? '').trim();
      if (cleanPartnerName.length < 2) {
        throw new HttpError(400, 'Nama pasangan minimal 2 karakter.');
      }
    }

    if (pool) {
      const result = await withPgTx(async (client) => {
        if (cleanCoupleName !== undefined) {
          await client.query('UPDATE couples SET couple_name = $1 WHERE id = $2', [cleanCoupleName, coupleId]);
        }
        if (cleanPartnerName !== undefined) {
          await client.query('UPDATE partners SET name = $1 WHERE id = $2 AND couple_id = $3', [
            cleanPartnerName,
            partnerId,
            coupleId,
          ]);
        }
        const [cRes, pRes] = await Promise.all([
          client.query('SELECT id, couple_name AS "coupleName", invite_code AS "inviteCode" FROM couples WHERE id = $1', [
            coupleId,
          ]),
          client.query(
            'SELECT id, couple_id AS "coupleId", name, role_label AS "roleLabel", avatar_color AS "avatarColor" FROM partners WHERE couple_id = $1 ORDER BY created_at ASC',
            [coupleId]
          ),
        ]);
        const updatedPartner = pRes.rows.find((p) => p.id === partnerId);
        return {
          couple: { ...cRes.rows[0], partners: pRes.rows },
          partner: updatedPartner,
        };
      });
      return res.json(result);
    }

    const couple = mem.couples.get(coupleId);
    if (!couple) throw new HttpError(404, 'Ruang pasangan tidak ditemukan.');
    if (cleanCoupleName !== undefined) {
      couple.coupleName = cleanCoupleName;
    }
    const partnerObj = mem.partners.get(partnerId);
    if (!partnerObj || partnerObj.coupleId !== coupleId) {
      throw new HttpError(404, 'Profil pasangan tidak ditemukan.');
    }
    if (cleanPartnerName !== undefined) {
      partnerObj.name = cleanPartnerName;
    }
    const partners = Array.from(mem.partners.values())
      .filter((p) => p.coupleId === coupleId)
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .map(({ id, coupleId: cId, name: pName, roleLabel, avatarColor }) => ({
        id,
        coupleId: cId,
        name: pName,
        roleLabel,
        avatarColor,
      }));
    const updatedPartner = partners.find((p) => p.id === partnerId);
    res.json({
      couple: { ...couple, partners },
      partner: updatedPartner,
    });
  })
);

// Categories (Menikah, Traveling, Investasi + Custom)
app.get(
  '/api/categories',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    if (pool) {
      const r = await pool.query(
        'SELECT id, couple_id AS "coupleId", name, icon, color, target_amount::float8 AS "targetAmount", is_default AS "isDefault" FROM categories WHERE couple_id=$1 ORDER BY is_default DESC, created_at ASC',
        [coupleId]
      );
      return res.json(r.rows);
    }
    const list = (mem.categories.get(coupleId) || []).map(({ id, coupleId: cId, name, icon, color, targetAmount, isDefault }) => ({
      id,
      coupleId: cId,
      name,
      icon,
      color,
      targetAmount,
      isDefault,
    }));
    res.json(list);
  })
);

app.post(
  '/api/categories',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const { name, icon = '✨', color = DEFAULT_CATEGORY_COLOR, targetAmount } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
    }
    const parsedTarget =
      targetAmount === undefined
        ? 0
        : parseStrictNumber(targetAmount, 'Target nominal kategori tidak valid.', { min: 0 });
    const cat = {
      id: randomUUID(),
      coupleId,
      name: String(name).trim(),
      icon: String(icon || '✨').slice(0, 16),
      color: String(color || DEFAULT_CATEGORY_COLOR).slice(0, 20),
      targetAmount: parsedTarget,
      isDefault: false,
    };
    if (pool) {
      await pool.query(
        'INSERT INTO categories(id, couple_id, name, icon, color, target_amount, is_default) VALUES($1,$2,$3,$4,$5,$6,false)',
        [cat.id, coupleId, cat.name, cat.icon, cat.color, cat.targetAmount]
      );
    } else {
      mem.categories.get(coupleId).push({ ...cat, createdAtMs: Date.now() });
    }
    res.status(201).json(cat);
  })
);

app.patch(
  '/api/categories/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const categoryId = assertUuid(req.params.id, 'categoryId');
    const { name, icon, color, targetAmount } = req.body || {};

    if (name !== undefined && String(name ?? '').trim().length < 2) {
      throw new HttpError(400, 'Nama kategori minimal 2 karakter.');
    }
    let parsedTarget;
    if (targetAmount !== undefined) {
      parsedTarget = parseStrictNumber(targetAmount, 'Target nominal kategori tidak valid.', { min: 0 });
    }

    if (pool) {
      const cat = await withPgTx(async (client) => {
        const curRes = await client.query(
          `SELECT id, couple_id AS "coupleId", name, icon, color,
                  target_amount::float8 AS "targetAmount", is_default AS "isDefault"
           FROM categories WHERE id = $1 AND couple_id = $2 FOR UPDATE`,
          [categoryId, coupleId]
        );
        if (!curRes.rowCount) {
          throw new HttpError(404, 'Kategori tidak ditemukan.');
        }
        const cur = curRes.rows[0];
        const nextName = name !== undefined ? String(name).trim() : cur.name;
        const nextIcon = icon !== undefined ? String(icon || '✨').slice(0, 16) : cur.icon;
        const nextColor = color !== undefined ? String(color || DEFAULT_CATEGORY_COLOR).slice(0, 20) : cur.color;
        const nextTarget = parsedTarget !== undefined ? parsedTarget : roundMoney(cur.targetAmount);

        const upd = await client.query(
          `UPDATE categories
           SET name = $1, icon = $2, color = $3, target_amount = $4
           WHERE id = $5 AND couple_id = $6
           RETURNING id, couple_id AS "coupleId", name, icon, color,
                     target_amount::float8 AS "targetAmount", is_default AS "isDefault"`,
          [nextName, nextIcon, nextColor, nextTarget, categoryId, coupleId]
        );
        return upd.rows[0];
      });
      return res.json(cat);
    }

    const list = mem.categories.get(coupleId) || [];
    const cat = list.find((c) => c.id === categoryId);
    if (!cat) {
      throw new HttpError(404, 'Kategori tidak ditemukan.');
    }
    if (name !== undefined) cat.name = String(name).trim();
    if (icon !== undefined) cat.icon = String(icon || '✨').slice(0, 16);
    if (color !== undefined) cat.color = String(color || DEFAULT_CATEGORY_COLOR).slice(0, 20);
    if (parsedTarget !== undefined) cat.targetAmount = parsedTarget;

    res.json({
      id: cat.id,
      coupleId: cat.coupleId,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      targetAmount: cat.targetAmount,
      isDefault: cat.isDefault,
    });
  })
);

app.delete(
  '/api/categories/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const categoryId = assertUuid(req.params.id, 'categoryId');

    if (pool) {
      await withPgTx(async (client) => {
        const curRes = await client.query(
          'SELECT id FROM categories WHERE id = $1 AND couple_id = $2 FOR UPDATE',
          [categoryId, coupleId]
        );
        if (!curRes.rowCount) {
          throw new HttpError(404, 'Kategori tidak ditemukan.');
        }

        const [txRef, bdgRef, noteRef, recRef] = await Promise.all([
          client.query('SELECT 1 FROM transactions WHERE couple_id = $1 AND category_id = $2 LIMIT 1', [
            coupleId,
            categoryId,
          ]),
          client.query('SELECT 1 FROM budgets WHERE couple_id = $1 AND category_id = $2 LIMIT 1', [
            coupleId,
            categoryId,
          ]),
          client.query('SELECT 1 FROM shared_notes WHERE couple_id = $1 AND category_id = $2 LIMIT 1', [
            coupleId,
            categoryId,
          ]),
          client.query('SELECT 1 FROM recurring_rules WHERE couple_id = $1 AND category_id = $2 LIMIT 1', [
            coupleId,
            categoryId,
          ]),
        ]);
        if (txRef.rowCount > 0 || bdgRef.rowCount > 0 || noteRef.rowCount > 0 || recRef.rowCount > 0) {
          throw new HttpError(
            409,
            'Kategori tidak dapat dihapus karena masih digunakan oleh transaksi, anggaran, catatan, atau tagihan rutin.'
          );
        }

        await client.query('DELETE FROM categories WHERE id = $1 AND couple_id = $2', [categoryId, coupleId]);
      });
      return res.json({ ok: true, id: categoryId });
    }

    const list = mem.categories.get(coupleId) || [];
    const idx = list.findIndex((c) => c.id === categoryId);
    if (idx < 0) {
      throw new HttpError(404, 'Kategori tidak ditemukan.');
    }

    const usedInTx = (mem.transactions.get(coupleId) || []).some((t) => t.categoryId === categoryId);
    const usedInBudget = (mem.budgets.get(coupleId) || []).some((b) => b.categoryId === categoryId);
    const usedInNotes = (mem.notes.get(coupleId) || []).some((n) => n.categoryId === categoryId);
    const usedInRecurring = (mem.recurringRules.get(coupleId) || []).some((r) => r.categoryId === categoryId);
    if (usedInTx || usedInBudget || usedInNotes || usedInRecurring) {
      throw new HttpError(
        409,
        'Kategori tidak dapat dihapus karena masih digunakan oleh transaksi, anggaran, catatan, atau tagihan rutin.'
      );
    }

    list.splice(idx, 1);
    for (const preset of mem.quickPresets.get(coupleId) || []) {
      if (preset.categoryId === categoryId) preset.categoryId = null;
    }
    res.json({ ok: true, id: categoryId });
  })
);

// ============================================================================
// Accounts / Wallets (Personal & Shared Couple Accounts)
// ============================================================================
app.get(
  '/api/accounts',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    let accounts;
    if (pool) {
      const r = await pool.query(
        `SELECT a.id, a.couple_id AS "coupleId", a.owner_partner_id AS "ownerPartnerId",
                p.name AS "ownerPartnerName", a.name, a.account_type AS "accountType",
                a.is_shared AS "isShared", a.initial_balance::float8 AS "initialBalance",
                a.balance::float8 AS balance, a.icon, a.color, a.created_at AS "createdAt"
         FROM accounts a
         LEFT JOIN partners p ON p.id = a.owner_partner_id
         WHERE a.couple_id = $1
         ORDER BY a.is_shared DESC, a.created_at ASC`,
        [coupleId]
      );
      accounts = r.rows;
    } else {
      accounts = [...(mem.accounts.get(coupleId) || [])]
        .sort((a, b) => Number(b.isShared) - Number(a.isShared) || a.createdAtMs - b.createdAtMs)
        .map(hydrateMemAccount);
    }
    res.json({ accounts, totals: computeAccountTotals(accounts) });
  })
);

app.post(
  '/api/accounts',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const {
      name,
      accountType = 'cash',
      isShared = false,
      ownerPartnerId,
      initialBalance,
      icon = DEFAULT_ACCOUNT_ICON,
      color = DEFAULT_ACCOUNT_COLOR,
    } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      throw new HttpError(400, 'Nama akun wajib diisi (minimal 2 karakter).');
    }
    if (!ACCOUNT_TYPES.includes(accountType)) {
      throw new HttpError(400, 'Tipe akun tidak valid.');
    }
    const cleanInitial =
      initialBalance === undefined
        ? 0
        : parseStrictNumber(initialBalance, 'Saldo awal harus berupa angka valid.');
    const shared = Boolean(isShared);

    let resolvedOwnerId = null;
    if (!shared) {
      if (ownerPartnerId !== undefined && ownerPartnerId !== null && ownerPartnerId !== '') {
        resolvedOwnerId = assertUuid(ownerPartnerId, 'ownerPartnerId');
      } else {
        resolvedOwnerId = req.partner.id;
      }
    }

    const id = randomUUID();
    const cleanName = String(name).trim();
    const cleanIcon = String(icon || DEFAULT_ACCOUNT_ICON).slice(0, 16);
    const cleanColor = String(color || DEFAULT_ACCOUNT_COLOR).slice(0, 20);

    if (pool) {
      let ownerPartnerName = null;
      if (resolvedOwnerId) {
        const pRes = await pool.query('SELECT id, name FROM partners WHERE id = $1 AND couple_id = $2', [
          resolvedOwnerId,
          coupleId,
        ]);
        if (!pRes.rowCount) {
          throw new HttpError(404, 'Pemilik akun (partner) tidak ditemukan.');
        }
        ownerPartnerName = pRes.rows[0].name;
      }

      const ins = await pool.query(
        `INSERT INTO accounts(id, couple_id, owner_partner_id, name, account_type, is_shared, initial_balance, balance, icon, color)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, couple_id AS "coupleId", owner_partner_id AS "ownerPartnerId", name,
                   account_type AS "accountType", is_shared AS "isShared",
                   initial_balance::float8 AS "initialBalance", balance::float8 AS balance,
                   icon, color, created_at AS "createdAt"`,
        [id, coupleId, resolvedOwnerId, cleanName, accountType, shared, cleanInitial, cleanInitial, cleanIcon, cleanColor]
      );
      return res.status(201).json({
        account: { ...ins.rows[0], ownerPartnerName },
      });
    }

    if (resolvedOwnerId) {
      const owner = mem.partners.get(resolvedOwnerId);
      if (!owner || owner.coupleId !== coupleId) {
        throw new HttpError(404, 'Pemilik akun (partner) tidak ditemukan.');
      }
    }

    const nowIso = new Date().toISOString();
    const acc = {
      id,
      coupleId,
      ownerPartnerId: resolvedOwnerId,
      name: cleanName,
      accountType,
      isShared: shared,
      initialBalance: cleanInitial,
      balance: cleanInitial,
      icon: cleanIcon,
      color: cleanColor,
      createdAt: nowIso,
      createdAtMs: Date.now(),
    };
    mem.accounts.get(coupleId).push(acc);
    res.status(201).json({ account: hydrateMemAccount(acc) });
  })
);

app.patch(
  '/api/accounts/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const accountId = assertUuid(req.params.id, 'accountId');
    const { name, accountType, isShared, ownerPartnerId, initialBalance, icon, color } = req.body || {};

    if (name !== undefined && String(name).trim().length < 2) {
      throw new HttpError(400, 'Nama akun wajib diisi (minimal 2 karakter).');
    }
    if (accountType !== undefined && !ACCOUNT_TYPES.includes(accountType)) {
      throw new HttpError(400, 'Tipe akun tidak valid.');
    }
    let parsedInitial;
    if (initialBalance !== undefined) {
      parsedInitial = parseStrictNumber(initialBalance, 'Saldo awal harus berupa angka valid.');
    }

    let validatedOwnerId;
    if (ownerPartnerId !== undefined && ownerPartnerId !== null && ownerPartnerId !== '') {
      validatedOwnerId = assertUuid(ownerPartnerId, 'ownerPartnerId');
    }

    if (pool) {
      const account = await withPgTx(async (client) => {
        const curRes = await client.query(
          `SELECT id, couple_id AS "coupleId", owner_partner_id AS "ownerPartnerId", name,
                  account_type AS "accountType", is_shared AS "isShared",
                  initial_balance::float8 AS "initialBalance", balance::float8 AS balance,
                  icon, color, created_at AS "createdAt"
           FROM accounts
           WHERE id = $1 AND couple_id = $2
           FOR UPDATE`,
          [accountId, coupleId]
        );
        if (!curRes.rowCount) {
          throw new HttpError(404, 'Akun tidak ditemukan.');
        }
        const existing = curRes.rows[0];

        const nextName = name !== undefined ? String(name).trim() : existing.name;
        const nextType = accountType !== undefined ? accountType : existing.accountType;
        const nextIsShared = isShared !== undefined ? Boolean(isShared) : existing.isShared;
        const nextIcon = icon !== undefined ? String(icon || DEFAULT_ACCOUNT_ICON).slice(0, 16) : existing.icon;
        const nextColor = color !== undefined ? String(color || DEFAULT_ACCOUNT_COLOR).slice(0, 20) : existing.color;

        let nextOwnerId = null;
        let ownerPartnerName = null;
        if (!nextIsShared) {
          if (validatedOwnerId !== undefined) {
            nextOwnerId = validatedOwnerId;
          } else {
            nextOwnerId = existing.ownerPartnerId || req.partner.id;
          }
          const pRes = await client.query('SELECT id, name FROM partners WHERE id = $1 AND couple_id = $2', [
            nextOwnerId,
            coupleId,
          ]);
          if (!pRes.rowCount) {
            throw new HttpError(404, 'Pemilik akun (partner) tidak ditemukan.');
          }
          ownerPartnerName = pRes.rows[0].name;
        }

        const nextInitial = parsedInitial !== undefined ? parsedInitial : roundMoney(existing.initialBalance);
        const deltaInitial = roundMoney(nextInitial - roundMoney(existing.initialBalance));

        const upd = await client.query(
          `UPDATE accounts
           SET name = $1, account_type = $2, is_shared = $3, owner_partner_id = $4,
               initial_balance = $5, balance = balance + $6, icon = $7, color = $8
           WHERE id = $9 AND couple_id = $10
           RETURNING id, couple_id AS "coupleId", owner_partner_id AS "ownerPartnerId", name,
                     account_type AS "accountType", is_shared AS "isShared",
                     initial_balance::float8 AS "initialBalance", balance::float8 AS balance,
                     icon, color, created_at AS "createdAt"`,
          [nextName, nextType, nextIsShared, nextOwnerId, nextInitial, deltaInitial, nextIcon, nextColor, accountId, coupleId]
        );
        return { ...upd.rows[0], ownerPartnerName };
      });
      return res.json({ account });
    }

    const list = mem.accounts.get(coupleId) || [];
    const acc = list.find((a) => a.id === accountId);
    if (!acc) throw new HttpError(404, 'Akun tidak ditemukan.');

    const nextIsShared = isShared !== undefined ? Boolean(isShared) : acc.isShared;
    let nextOwnerId = null;
    if (!nextIsShared) {
      nextOwnerId = validatedOwnerId !== undefined ? validatedOwnerId : acc.ownerPartnerId || req.partner.id;
      const owner = mem.partners.get(nextOwnerId);
      if (!owner || owner.coupleId !== coupleId) {
        throw new HttpError(404, 'Pemilik akun (partner) tidak ditemukan.');
      }
    }

    if (name !== undefined) acc.name = String(name).trim();
    if (accountType !== undefined) acc.accountType = accountType;
    acc.isShared = nextIsShared;
    acc.ownerPartnerId = nextOwnerId;
    if (icon !== undefined) acc.icon = String(icon || DEFAULT_ACCOUNT_ICON).slice(0, 16);
    if (color !== undefined) acc.color = String(color || DEFAULT_ACCOUNT_COLOR).slice(0, 20);
    if (parsedInitial !== undefined) {
      const deltaInitial = roundMoney(parsedInitial - roundMoney(acc.initialBalance));
      acc.initialBalance = parsedInitial;
      acc.balance = roundMoney(acc.balance + deltaInitial);
    }

    res.json({ account: hydrateMemAccount(acc) });
  })
);

app.delete(
  '/api/accounts/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const accountId = assertUuid(req.params.id, 'accountId');

    if (pool) {
      await withPgTx(async (client) => {
        await client.query(
          'SELECT id FROM transactions WHERE couple_id = $1 AND account_id = $2 ORDER BY id ASC FOR UPDATE',
          [coupleId, accountId]
        );
        const del = await client.query('DELETE FROM accounts WHERE id = $1 AND couple_id = $2 RETURNING id', [
          accountId,
          coupleId,
        ]);
        if (!del.rowCount) {
          throw new HttpError(404, 'Akun tidak ditemukan.');
        }
      });
      return res.json({ ok: true, id: accountId });
    }

    const list = mem.accounts.get(coupleId) || [];
    const idx = list.findIndex((a) => a.id === accountId);
    if (idx < 0) throw new HttpError(404, 'Akun tidak ditemukan.');
    list.splice(idx, 1);

    const txs = mem.transactions.get(coupleId) || [];
    for (const tx of txs) {
      if (tx.accountId === accountId) {
        tx.accountId = null;
      }
    }
    const transfers = mem.transfers.get(coupleId) || [];
    for (const tr of transfers) {
      if (tr.fromAccountId === accountId) tr.fromAccountId = null;
      if (tr.toAccountId === accountId) tr.toAccountId = null;
    }
    for (const rule of mem.recurringRules.get(coupleId) || []) {
      if (rule.accountId === accountId) rule.accountId = null;
    }
    for (const preset of mem.quickPresets.get(coupleId) || []) {
      if (preset.accountId === accountId) preset.accountId = null;
    }
    res.json({ ok: true, id: accountId });
  })
);

app.get(
  '/api/accounts/transfers',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const tz = parseTzOffset(req.query.tzOffset);
    const monthStr = validateMonth(req.query.month, { required: false });
    const bounds = monthStr ? getMonthBounds(monthStr, tz) : null;

    if (pool) {
      const clauses = ['t.couple_id = $1'];
      const params = [coupleId];
      if (bounds) {
        params.push(bounds.startIso, bounds.endIso);
        clauses.push(`t.occurred_at >= $${params.length - 1} AND t.occurred_at < $${params.length}`);
      }
      const r = await pool.query(
        `SELECT t.id, t.couple_id AS "coupleId", t.partner_id AS "partnerId", p.name AS "partnerName",
                t.from_account_id AS "fromAccountId", fa.name AS "fromAccountName", fa.icon AS "fromAccountIcon",
                t.to_account_id AS "toAccountId", ta.name AS "toAccountName", ta.icon AS "toAccountIcon",
                t.amount::float8 AS amount, t.note, t.occurred_at AS "occurredAt", t.created_at AS "createdAt"
         FROM account_transfers t
         JOIN partners p ON p.id = t.partner_id
         LEFT JOIN accounts fa ON fa.id = t.from_account_id
         LEFT JOIN accounts ta ON ta.id = t.to_account_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY t.occurred_at DESC, t.created_at DESC`,
        params
      );
      return res.json({ transfers: r.rows });
    }

    let list = mem.transfers.get(coupleId) || [];
    if (bounds) {
      list = list.filter((tr) => {
        const ms = new Date(tr.occurredAt).getTime();
        return ms >= bounds.startMs && ms < bounds.endMs;
      });
    }
    const transfers = [...list]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || b.createdAtMs - a.createdAtMs)
      .map((tr) => hydrateMemTransfer(tr, coupleId));
    res.json({ transfers });
  })
);

app.post(
  '/api/accounts/transfer',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId, id: partnerId, name: partnerName } = req.partner;
    const { fromAccountId, toAccountId, amount, note = '', date, occurredAt } = req.body || {};

    const cleanFromId = assertUuid(fromAccountId, 'fromAccountId');
    const cleanToId = assertUuid(toAccountId, 'toAccountId');
    if (cleanFromId === cleanToId) {
      throw new HttpError(400, 'Dompet asal dan tujuan tidak boleh sama.');
    }

    const numericAmount = parseStrictNumber(amount, 'Nominal transfer harus lebih dari 0.', { exclusiveMin: 0 });

    const hasOccurredAt = occurredAt !== undefined;
    const hasDate = date !== undefined;
    const rawDate = hasOccurredAt ? occurredAt : date;
    const isoDate = parseOccurredAt(rawDate, { allowUndefined: !hasOccurredAt && !hasDate });
    const cleanNote = String(note ?? '');
    const transferId = randomUUID();
    const createdAtIso = new Date().toISOString();

    if (pool) {
      const result = await withPgTx(async (client) => {
        const lockIds = [cleanFromId, cleanToId].sort();
        const lockRes = await client.query(
          `SELECT id, couple_id AS "coupleId", owner_partner_id AS "ownerPartnerId", name,
                  account_type AS "accountType", is_shared AS "isShared",
                  initial_balance::float8 AS "initialBalance", balance::float8 AS balance,
                  icon, color, created_at AS "createdAt"
           FROM accounts
           WHERE couple_id = $1 AND id = ANY($2::uuid[])
           ORDER BY id ASC
           FOR UPDATE`,
          [coupleId, lockIds]
        );

        const fromRow = lockRes.rows.find((a) => a.id === cleanFromId);
        const toRow = lockRes.rows.find((a) => a.id === cleanToId);
        if (!fromRow || !toRow) {
          throw new HttpError(404, 'Dompet asal atau tujuan tidak ditemukan.');
        }
        if (roundMoney(fromRow.balance) < numericAmount) {
          throw new HttpError(400, 'Saldo dompet asal tidak mencukupi untuk transfer.');
        }

        await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND couple_id = $3', [
          numericAmount,
          cleanFromId,
          coupleId,
        ]);
        await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND couple_id = $3', [
          numericAmount,
          cleanToId,
          coupleId,
        ]);

        await client.query(
          `INSERT INTO account_transfers(id, couple_id, partner_id, from_account_id, to_account_id, amount, note, occurred_at, created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [transferId, coupleId, partnerId, cleanFromId, cleanToId, numericAmount, cleanNote, isoDate, createdAtIso]
        );

        const allRes = await client.query(
          `SELECT a.id, a.couple_id AS "coupleId", a.owner_partner_id AS "ownerPartnerId",
                  p.name AS "ownerPartnerName", a.name, a.account_type AS "accountType",
                  a.is_shared AS "isShared", a.initial_balance::float8 AS "initialBalance",
                  a.balance::float8 AS balance, a.icon, a.color, a.created_at AS "createdAt"
           FROM accounts a
           LEFT JOIN partners p ON p.id = a.owner_partner_id
           WHERE a.couple_id = $1`,
          [coupleId]
        );
        const fromAccount = allRes.rows.find((a) => a.id === cleanFromId);
        const toAccount = allRes.rows.find((a) => a.id === cleanToId);

        return {
          transfer: {
            id: transferId,
            coupleId,
            partnerId,
            partnerName,
            fromAccountId: fromAccount.id,
            fromAccountName: fromAccount.name,
            fromAccountIcon: fromAccount.icon,
            toAccountId: toAccount.id,
            toAccountName: toAccount.name,
            toAccountIcon: toAccount.icon,
            amount: numericAmount,
            note: cleanNote,
            occurredAt: isoDate,
            createdAt: createdAtIso,
          },
          fromAccount,
          toAccount,
          totals: computeAccountTotals(allRes.rows),
        };
      });
      return res.status(201).json(result);
    }

    const memAccounts = mem.accounts.get(coupleId) || [];
    const fromAcc = memAccounts.find((a) => a.id === cleanFromId);
    const toAcc = memAccounts.find((a) => a.id === cleanToId);
    if (!fromAcc || !toAcc) {
      throw new HttpError(404, 'Dompet asal atau tujuan tidak ditemukan.');
    }
    if (roundMoney(fromAcc.balance) < numericAmount) {
      throw new HttpError(400, 'Saldo dompet asal tidak mencukupi untuk transfer.');
    }

    fromAcc.balance = roundMoney(fromAcc.balance - numericAmount);
    toAcc.balance = roundMoney(toAcc.balance + numericAmount);

    const trObj = {
      id: transferId,
      coupleId,
      partnerId,
      partnerName,
      fromAccountId: cleanFromId,
      toAccountId: cleanToId,
      amount: numericAmount,
      note: cleanNote,
      occurredAt: isoDate,
      createdAt: createdAtIso,
      createdAtMs: Date.now(),
    };
    mem.transfers.get(coupleId).push(trObj);

    const hydratedAccounts = memAccounts.map(hydrateMemAccount);
    res.status(201).json({
      transfer: hydrateMemTransfer(trObj, coupleId),
      fromAccount: hydrateMemAccount(fromAcc),
      toAccount: hydrateMemAccount(toAcc),
      totals: computeAccountTotals(hydratedAccounts),
    });
  })
);

// ============================================================================
// Transactions (Income & Expense per Partner, Optional Account & Month Filter)
// ============================================================================
app.get(
  '/api/transactions',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const { partnerId, categoryId, type, accountId, month, tzOffset } = req.query;

    const tz = parseTzOffset(tzOffset);
    const monthStr = validateMonth(month, { required: false });
    const bounds = monthStr ? getMonthBounds(monthStr, tz) : null;

    if (type !== undefined && type !== '' && !['income', 'expense'].includes(type)) {
      throw new HttpError(400, 'Filter type harus income atau expense.');
    }
    const cleanPartnerId = partnerId ? assertUuid(String(partnerId), 'partnerId') : null;
    const cleanCategoryId = categoryId ? assertUuid(String(categoryId), 'categoryId') : null;

    let accountFilterMode = 'all';
    let cleanAccountId = null;
    if (accountId !== undefined && accountId !== '') {
      const rawAcc = String(accountId).trim();
      if (rawAcc === 'none' || rawAcc === 'null') {
        accountFilterMode = 'none';
      } else {
        accountFilterMode = 'id';
        cleanAccountId = assertUuid(rawAcc, 'accountId');
      }
    }

    if (pool) {
      const clauses = ['t.couple_id = $1'];
      const params = [coupleId];
      if (bounds) {
        params.push(bounds.startIso, bounds.endIso);
        clauses.push(`t.occurred_at >= $${params.length - 1} AND t.occurred_at < $${params.length}`);
      }
      if (cleanPartnerId) {
        params.push(cleanPartnerId);
        clauses.push(`t.partner_id = $${params.length}`);
      }
      if (cleanCategoryId) {
        params.push(cleanCategoryId);
        clauses.push(`t.category_id = $${params.length}`);
      }
      if (type) {
        params.push(String(type));
        clauses.push(`t.type = $${params.length}`);
      }
      if (accountFilterMode === 'none') {
        clauses.push('t.account_id IS NULL');
      } else if (accountFilterMode === 'id') {
        params.push(cleanAccountId);
        clauses.push(`t.account_id = $${params.length}`);
      }

      const r = await pool.query(
        `SELECT t.id, t.couple_id AS "coupleId", t.partner_id AS "partnerId", p.name AS "partnerName",
                t.category_id AS "categoryId", c.name AS "categoryName", c.icon AS "categoryIcon",
                t.account_id AS "accountId", a.name AS "accountName", a.icon AS "accountIcon",
                t.type, t.amount::float8 AS amount, t.note, t.occurred_at AS "occurredAt"
         FROM transactions t
         JOIN partners p ON p.id = t.partner_id
         JOIN categories c ON c.id = t.category_id
         LEFT JOIN accounts a ON a.id = t.account_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY t.occurred_at DESC, t.created_at DESC`,
        params
      );
      return res.json({ transactions: r.rows });
    }

    let rows = (mem.transactions.get(coupleId) || []).filter((tx) => {
      if (bounds) {
        const ms = new Date(tx.occurredAt).getTime();
        if (ms < bounds.startMs || ms >= bounds.endMs) return false;
      }
      if (cleanPartnerId && tx.partnerId !== cleanPartnerId) return false;
      if (cleanCategoryId && tx.categoryId !== cleanCategoryId) return false;
      if (type && tx.type !== type) return false;
      if (accountFilterMode === 'none' && tx.accountId !== null) return false;
      if (accountFilterMode === 'id' && tx.accountId !== cleanAccountId) return false;
      return true;
    });

    rows = [...rows]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || b.createdAtMs - a.createdAtMs)
      .map((tx) => hydrateMemTx(tx, coupleId));

    res.json({ transactions: rows });
  })
);

app.post(
  '/api/transactions',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId, id: partnerId, name: partnerName } = req.partner;
    const { categoryId, type, amount, note = '', occurredAt, accountId } = req.body || {};

    const cleanCategoryId = assertUuid(categoryId, 'categoryId');
    if (!['income', 'expense'].includes(type)) {
      throw new HttpError(400, 'Tipe (income/expense) dan nominal (> 0) wajib valid.');
    }
    const numericAmount = parseStrictNumber(amount, 'Tipe (income/expense) dan nominal (> 0) wajib valid.', {
      exclusiveMin: 0,
    });
    const isoDate = parseOccurredAt(occurredAt, { allowUndefined: true });
    const cleanAccountId =
      accountId === undefined || accountId === null || accountId === '' ? null : assertUuid(accountId, 'accountId');
    const cleanNote = String(note ?? '');
    const id = randomUUID();

    if (pool) {
      const transaction = await withPgTx(async (client) => {
        const cRes = await client.query('SELECT id, name, icon FROM categories WHERE id = $1 AND couple_id = $2', [
          cleanCategoryId,
          coupleId,
        ]);
        if (!cRes.rowCount) {
          throw new HttpError(404, 'Kategori tidak ditemukan.');
        }
        const cat = cRes.rows[0];

        let acc = null;
        if (cleanAccountId) {
          const aRes = await client.query('SELECT id, name, icon FROM accounts WHERE id = $1 AND couple_id = $2 FOR UPDATE', [
            cleanAccountId,
            coupleId,
          ]);
          if (!aRes.rowCount) {
            throw new HttpError(404, 'Akun tidak ditemukan.');
          }
          acc = aRes.rows[0];
          await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND couple_id = $3', [
            signedDelta(type, numericAmount),
            cleanAccountId,
            coupleId,
          ]);
        }

        await client.query(
          `INSERT INTO transactions(id, couple_id, partner_id, category_id, account_id, type, amount, note, occurred_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [id, coupleId, partnerId, cleanCategoryId, cleanAccountId, type, numericAmount, cleanNote, isoDate]
        );

        return {
          id,
          coupleId,
          partnerId,
          partnerName,
          categoryId: cleanCategoryId,
          categoryName: cat.name,
          categoryIcon: cat.icon,
          accountId: acc ? acc.id : null,
          accountName: acc ? acc.name : null,
          accountIcon: acc ? acc.icon : null,
          type,
          amount: numericAmount,
          note: cleanNote,
          occurredAt: isoDate,
        };
      });
      return res.status(201).json({ transaction });
    }

    const cat = (mem.categories.get(coupleId) || []).find((c) => c.id === cleanCategoryId);
    if (!cat) throw new HttpError(404, 'Kategori tidak ditemukan.');

    let acc = null;
    if (cleanAccountId) {
      acc = (mem.accounts.get(coupleId) || []).find((a) => a.id === cleanAccountId);
      if (!acc) throw new HttpError(404, 'Akun tidak ditemukan.');
    }

    if (acc) {
      acc.balance = roundMoney(acc.balance + signedDelta(type, numericAmount));
    }

    const tx = {
      id,
      coupleId,
      partnerId,
      partnerName,
      categoryId: cleanCategoryId,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      accountId: cleanAccountId,
      type,
      amount: numericAmount,
      note: cleanNote,
      occurredAt: isoDate,
      createdAtMs: Date.now(),
    };
    mem.transactions.get(coupleId).push(tx);
    res.status(201).json({ transaction: hydrateMemTx(tx, coupleId) });
  })
);

app.patch(
  '/api/transactions/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const txId = assertUuid(req.params.id, 'transactionId');
    const body = req.body || {};

    let requestedCategoryId;
    if (body.categoryId !== undefined) {
      requestedCategoryId = assertUuid(body.categoryId, 'categoryId');
    }
    if (body.type !== undefined && !['income', 'expense'].includes(body.type)) {
      throw new HttpError(400, 'Tipe transaksi harus income atau expense.');
    }
    let requestedAmount;
    if (body.amount !== undefined) {
      requestedAmount = parseStrictNumber(body.amount, 'Nominal transaksi harus lebih dari 0.', { exclusiveMin: 0 });
    }
    let requestedOccurredAt;
    if (body.occurredAt !== undefined) {
      requestedOccurredAt = parseOccurredAt(body.occurredAt, { allowUndefined: false });
    }
    let hasAccountChange = false;
    let requestedAccountId = null;
    if ('accountId' in body && body.accountId !== undefined) {
      hasAccountChange = true;
      requestedAccountId =
        body.accountId === null || body.accountId === '' ? null : assertUuid(body.accountId, 'accountId');
    }

    if (pool) {
      const transaction = await withPgTx(async (client) => {
        const txRes = await client.query(
          `SELECT id, couple_id AS "coupleId", partner_id AS "partnerId", category_id AS "categoryId",
                  account_id AS "accountId", type, amount::float8 AS amount, note, occurred_at AS "occurredAt"
           FROM transactions
           WHERE id = $1 AND couple_id = $2
           FOR UPDATE`,
          [txId, coupleId]
        );
        if (!txRes.rowCount) {
          throw new HttpError(404, 'Transaksi tidak ditemukan.');
        }
        const oldTx = txRes.rows[0];

        const nextCategoryId = requestedCategoryId !== undefined ? requestedCategoryId : oldTx.categoryId;
        const nextType = body.type !== undefined ? body.type : oldTx.type;
        const nextAmount = requestedAmount !== undefined ? requestedAmount : roundMoney(oldTx.amount);
        const nextNote = body.note !== undefined ? String(body.note ?? '') : oldTx.note;
        const nextOccurredAt = requestedOccurredAt !== undefined ? requestedOccurredAt : oldTx.occurredAt;
        const nextAccountId = hasAccountChange ? requestedAccountId : oldTx.accountId;

        if (nextCategoryId !== oldTx.categoryId) {
          const cRes = await client.query('SELECT id FROM categories WHERE id = $1 AND couple_id = $2', [
            nextCategoryId,
            coupleId,
          ]);
          if (!cRes.rowCount) {
            throw new HttpError(404, 'Kategori tidak ditemukan.');
          }
        }

        const lockIds = [...new Set([oldTx.accountId, nextAccountId].filter(Boolean))].sort();
        if (lockIds.length > 0) {
          const accRes = await client.query(
            `SELECT id, name, icon
             FROM accounts
             WHERE couple_id = $1 AND id = ANY($2::uuid[])
             ORDER BY id ASC
             FOR UPDATE`,
            [coupleId, lockIds]
          );
          if (nextAccountId && !accRes.rows.some((r) => r.id === nextAccountId)) {
            throw new HttpError(404, 'Akun tujuan tidak ditemukan.');
          }
        }

        const oldDelta = signedDelta(oldTx.type, roundMoney(oldTx.amount));
        const newDelta = signedDelta(nextType, nextAmount);

        if (oldTx.accountId === null && nextAccountId !== null) {
          await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND couple_id = $3', [
            newDelta,
            nextAccountId,
            coupleId,
          ]);
        } else if (oldTx.accountId !== null && nextAccountId === null) {
          await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND couple_id = $3', [
            -oldDelta,
            oldTx.accountId,
            coupleId,
          ]);
        } else if (oldTx.accountId !== null && oldTx.accountId === nextAccountId) {
          const netDelta = roundMoney(newDelta - oldDelta);
          if (netDelta !== 0) {
            await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND couple_id = $3', [
              netDelta,
              nextAccountId,
              coupleId,
            ]);
          }
        } else if (oldTx.accountId !== null && nextAccountId !== null && oldTx.accountId !== nextAccountId) {
          for (const id of lockIds) {
            const delta = id === oldTx.accountId ? -oldDelta : newDelta;
            await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND couple_id = $3', [
              delta,
              id,
              coupleId,
            ]);
          }
        }

        await client.query(
          `UPDATE transactions
           SET category_id = $1, account_id = $2, type = $3, amount = $4, note = $5, occurred_at = $6
           WHERE id = $7 AND couple_id = $8`,
          [nextCategoryId, nextAccountId, nextType, nextAmount, nextNote, nextOccurredAt, txId, coupleId]
        );

        const joined = await client.query(
          `SELECT t.id, t.couple_id AS "coupleId", t.partner_id AS "partnerId", p.name AS "partnerName",
                  t.category_id AS "categoryId", c.name AS "categoryName", c.icon AS "categoryIcon",
                  t.account_id AS "accountId", a.name AS "accountName", a.icon AS "accountIcon",
                  t.type, t.amount::float8 AS amount, t.note, t.occurred_at AS "occurredAt"
           FROM transactions t
           JOIN partners p ON p.id = t.partner_id
           JOIN categories c ON c.id = t.category_id
           LEFT JOIN accounts a ON a.id = t.account_id
           WHERE t.id = $1 AND t.couple_id = $2`,
          [txId, coupleId]
        );
        return joined.rows[0];
      });
      return res.json({ transaction });
    }

    const list = mem.transactions.get(coupleId) || [];
    const tx = list.find((t) => t.id === txId);
    if (!tx) throw new HttpError(404, 'Transaksi tidak ditemukan.');

    const nextCategoryId = requestedCategoryId !== undefined ? requestedCategoryId : tx.categoryId;
    const nextType = body.type !== undefined ? body.type : tx.type;
    const nextAmount = requestedAmount !== undefined ? requestedAmount : roundMoney(tx.amount);
    const nextNote = body.note !== undefined ? String(body.note ?? '') : tx.note;
    const nextOccurredAt = requestedOccurredAt !== undefined ? requestedOccurredAt : tx.occurredAt;
    const nextAccountId = hasAccountChange ? requestedAccountId : tx.accountId;

    const cat = (mem.categories.get(coupleId) || []).find((c) => c.id === nextCategoryId);
    if (!cat) throw new HttpError(404, 'Kategori tidak ditemukan.');

    const accounts = mem.accounts.get(coupleId) || [];
    const oldAcc = tx.accountId ? accounts.find((a) => a.id === tx.accountId) : null;
    const newAcc = nextAccountId ? accounts.find((a) => a.id === nextAccountId) : null;
    if (nextAccountId && !newAcc) throw new HttpError(404, 'Akun tujuan tidak ditemukan.');

    const oldDelta = signedDelta(tx.type, roundMoney(tx.amount));
    const newDelta = signedDelta(nextType, nextAmount);

    if (oldAcc) oldAcc.balance = roundMoney(oldAcc.balance - oldDelta);
    if (newAcc) newAcc.balance = roundMoney(newAcc.balance + newDelta);

    tx.categoryId = nextCategoryId;
    tx.categoryName = cat.name;
    tx.categoryIcon = cat.icon;
    tx.accountId = nextAccountId;
    tx.type = nextType;
    tx.amount = nextAmount;
    tx.note = nextNote;
    tx.occurredAt = nextOccurredAt;

    res.json({ transaction: hydrateMemTx(tx, coupleId) });
  })
);

app.delete(
  '/api/transactions/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const txId = assertUuid(req.params.id, 'transactionId');

    if (pool) {
      await withPgTx(async (client) => {
        const txRes = await client.query(
          'SELECT id, account_id AS "accountId", type, amount::float8 AS amount FROM transactions WHERE id = $1 AND couple_id = $2 FOR UPDATE',
          [txId, coupleId]
        );
        if (!txRes.rowCount) {
          throw new HttpError(404, 'Transaksi tidak ditemukan.');
        }
        const tx = txRes.rows[0];
        if (tx.accountId) {
          await client.query('SELECT id FROM accounts WHERE id = $1 AND couple_id = $2 FOR UPDATE', [
            tx.accountId,
            coupleId,
          ]);
          await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND couple_id = $3', [
            -signedDelta(tx.type, roundMoney(tx.amount)),
            tx.accountId,
            coupleId,
          ]);
        }
        await client.query('DELETE FROM transactions WHERE id = $1 AND couple_id = $2', [txId, coupleId]);
      });
      return res.json({ ok: true, id: txId });
    }

    const list = mem.transactions.get(coupleId) || [];
    const idx = list.findIndex((t) => t.id === txId);
    if (idx < 0) throw new HttpError(404, 'Transaksi tidak ditemukan.');
    const tx = list[idx];
    if (tx.accountId) {
      const acc = (mem.accounts.get(coupleId) || []).find((a) => a.id === tx.accountId);
      if (acc) {
        acc.balance = roundMoney(acc.balance - signedDelta(tx.type, roundMoney(tx.amount)));
      }
    }
    list.splice(idx, 1);
    res.json({ ok: true, id: txId });
  })
);

// ============================================================================
// Budgets (Monthly Category Spending Limits)
// ============================================================================
async function getMemCategorySpent(coupleId, categoryId, monthStr, tzOffset) {
  const bounds = getMonthBounds(monthStr, tzOffset);
  let spent = 0;
  for (const tx of mem.transactions.get(coupleId) || []) {
    if (tx.type !== 'expense' || tx.categoryId !== categoryId) continue;
    const ms = new Date(tx.occurredAt).getTime();
    if (ms >= bounds.startMs && ms < bounds.endMs) {
      spent = roundMoney(spent + tx.amount);
    }
  }
  return spent;
}

async function getPgCategorySpent(coupleId, categoryId, monthStr, tzOffset) {
  const bounds = getMonthBounds(monthStr, tzOffset);
  const r = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::float8 AS spent
     FROM transactions
     WHERE couple_id = $1 AND category_id = $2 AND type = 'expense' AND occurred_at >= $3 AND occurred_at < $4`,
    [coupleId, categoryId, bounds.startIso, bounds.endIso]
  );
  return roundMoney(r.rows[0]?.spent || 0);
}

app.get(
  '/api/budgets',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const tz = parseTzOffset(req.query.tzOffset);
    const monthStr = validateMonth(req.query.month, { required: true, defaultTzOffset: tz });
    const bounds = getMonthBounds(monthStr, tz);

    let budgetRows = [];
    const spentMap = new Map();

    if (pool) {
      const [bRes, sRes] = await Promise.all([
        pool.query(
          `SELECT b.id, b.couple_id AS "coupleId", b.category_id AS "categoryId",
                  c.name AS "categoryName", c.icon AS "categoryIcon", c.color AS "categoryColor",
                  b.month, b.limit_amount::float8 AS "limitAmount"
           FROM budgets b
           JOIN categories c ON c.id = b.category_id
           WHERE b.couple_id = $1 AND b.month = $2
           ORDER BY c.name ASC`,
          [coupleId, monthStr]
        ),
        pool.query(
          `SELECT category_id AS "categoryId", COALESCE(SUM(amount), 0)::float8 AS spent
           FROM transactions
           WHERE couple_id = $1 AND type = 'expense' AND occurred_at >= $2 AND occurred_at < $3
           GROUP BY category_id`,
          [coupleId, bounds.startIso, bounds.endIso]
        ),
      ]);
      budgetRows = bRes.rows;
      for (const row of sRes.rows) {
        spentMap.set(row.categoryId, roundMoney(row.spent));
      }
    } else {
      const categories = mem.categories.get(coupleId) || [];
      const catById = new Map(categories.map((c) => [c.id, c]));
      for (const tx of mem.transactions.get(coupleId) || []) {
        if (tx.type !== 'expense') continue;
        const ms = new Date(tx.occurredAt).getTime();
        if (ms >= bounds.startMs && ms < bounds.endMs) {
          spentMap.set(tx.categoryId, roundMoney((spentMap.get(tx.categoryId) || 0) + tx.amount));
        }
      }
      budgetRows = (mem.budgets.get(coupleId) || [])
        .filter((b) => b.month === monthStr)
        .map((b) => {
          const cat = catById.get(b.categoryId);
          return {
            id: b.id,
            coupleId: b.coupleId,
            categoryId: b.categoryId,
            categoryName: cat ? cat.name : '',
            categoryIcon: cat ? cat.icon : '✨',
            categoryColor: cat ? cat.color : DEFAULT_CATEGORY_COLOR,
            month: b.month,
            limitAmount: b.limitAmount,
          };
        })
        .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    }

    const budgets = budgetRows.map((row) => buildMonthlyBudget(row, spentMap.get(row.categoryId) || 0));
    const totalLimit = roundMoney(budgets.reduce((s, b) => s + b.limitAmount, 0));
    const totalSpent = roundMoney(budgets.reduce((s, b) => s + b.spent, 0));
    const totalRemaining = roundMoney(totalLimit - totalSpent);

    res.json({
      month: monthStr,
      totalLimit,
      totalSpent,
      totalRemaining,
      budgets,
    });
  })
);

const upsertBudgetHandler = asyncHandler(async (req, res) => {
  const { coupleId } = req.partner;
  const { categoryId, month, limitAmount } = req.body || {};
  const tz = parseTzOffset(req.query.tzOffset ?? req.body?.tzOffset);

  const cleanCategoryId = assertUuid(categoryId, 'categoryId');
  if (month === undefined || month === null || String(month).trim() === '') {
    throw new HttpError(400, 'Format bulan harus YYYY-MM.');
  }
  const monthStr = validateMonth(month);
  const cleanLimit = parseStrictNumber(limitAmount, 'Batas anggaran (limitAmount) harus lebih dari 0.', {
    exclusiveMin: 0,
  });

  if (pool) {
    const cRes = await pool.query('SELECT id, name, icon, color FROM categories WHERE id = $1 AND couple_id = $2', [
      cleanCategoryId,
      coupleId,
    ]);
    if (!cRes.rowCount) {
      throw new HttpError(404, 'Kategori tidak ditemukan.');
    }
    const cat = cRes.rows[0];

    const upRes = await pool.query(
      `INSERT INTO budgets(id, couple_id, category_id, month, limit_amount)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (couple_id, category_id, month)
       DO UPDATE SET limit_amount = EXCLUDED.limit_amount, updated_at = now()
       RETURNING id, couple_id AS "coupleId", category_id AS "categoryId", month,
                 limit_amount::float8 AS "limitAmount", (xmax = 0) AS inserted`,
      [randomUUID(), coupleId, cleanCategoryId, monthStr, cleanLimit]
    );
    const row = upRes.rows[0];
    const spent = await getPgCategorySpent(coupleId, cleanCategoryId, monthStr, tz);
    const budget = buildMonthlyBudget(
      {
        ...row,
        categoryName: cat.name,
        categoryIcon: cat.icon,
        categoryColor: cat.color,
      },
      spent
    );
    return res.status(row.inserted ? 201 : 200).json({ budget });
  }

  const cat = (mem.categories.get(coupleId) || []).find((c) => c.id === cleanCategoryId);
  if (!cat) throw new HttpError(404, 'Kategori tidak ditemukan.');

  const list = mem.budgets.get(coupleId);
  let entry = list.find((b) => b.categoryId === cleanCategoryId && b.month === monthStr);
  let status = 200;
  if (entry) {
    entry.limitAmount = cleanLimit;
    entry.updatedAt = new Date().toISOString();
  } else {
    status = 201;
    entry = {
      id: randomUUID(),
      coupleId,
      categoryId: cleanCategoryId,
      month: monthStr,
      limitAmount: cleanLimit,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    list.push(entry);
  }
  const spent = await getMemCategorySpent(coupleId, cleanCategoryId, monthStr, tz);
  const budget = buildMonthlyBudget(
    {
      ...entry,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      categoryColor: cat.color,
    },
    spent
  );
  res.status(status).json({ budget });
});

app.post('/api/budgets', authPartner, upsertBudgetHandler);
app.put('/api/budgets', authPartner, upsertBudgetHandler);

app.patch(
  '/api/budgets/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const budgetId = assertUuid(req.params.id, 'budgetId');
    const { limitAmount } = req.body || {};
    const tz = parseTzOffset(req.query.tzOffset ?? req.body?.tzOffset);

    const cleanLimit = parseStrictNumber(limitAmount, 'Batas anggaran (limitAmount) harus lebih dari 0.', {
      exclusiveMin: 0,
    });

    if (pool) {
      const upd = await pool.query(
        `UPDATE budgets b
         SET limit_amount = $1, updated_at = now()
         FROM categories c
         WHERE b.id = $2 AND b.couple_id = $3 AND c.id = b.category_id
         RETURNING b.id, b.couple_id AS "coupleId", b.category_id AS "categoryId",
                   c.name AS "categoryName", c.icon AS "categoryIcon", c.color AS "categoryColor",
                   b.month, b.limit_amount::float8 AS "limitAmount"`,
        [cleanLimit, budgetId, coupleId]
      );
      if (!upd.rowCount) throw new HttpError(404, 'Anggaran tidak ditemukan.');
      const row = upd.rows[0];
      const spent = await getPgCategorySpent(coupleId, row.categoryId, row.month, tz);
      return res.json({ budget: buildMonthlyBudget(row, spent) });
    }

    const list = mem.budgets.get(coupleId) || [];
    const entry = list.find((b) => b.id === budgetId);
    if (!entry) throw new HttpError(404, 'Anggaran tidak ditemukan.');
    entry.limitAmount = cleanLimit;
    entry.updatedAt = new Date().toISOString();
    const cat = (mem.categories.get(coupleId) || []).find((c) => c.id === entry.categoryId);
    const spent = await getMemCategorySpent(coupleId, entry.categoryId, entry.month, tz);
    res.json({
      budget: buildMonthlyBudget(
        {
          ...entry,
          categoryName: cat ? cat.name : '',
          categoryIcon: cat ? cat.icon : '✨',
          categoryColor: cat ? cat.color : DEFAULT_CATEGORY_COLOR,
        },
        spent
      ),
    });
  })
);

app.delete(
  '/api/budgets/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const budgetId = assertUuid(req.params.id, 'budgetId');

    if (pool) {
      const del = await pool.query('DELETE FROM budgets WHERE id = $1 AND couple_id = $2 RETURNING id', [
        budgetId,
        coupleId,
      ]);
      if (!del.rowCount) throw new HttpError(404, 'Anggaran tidak ditemukan.');
      return res.json({ ok: true, id: budgetId });
    }

    const list = mem.budgets.get(coupleId) || [];
    const idx = list.findIndex((b) => b.id === budgetId);
    if (idx < 0) throw new HttpError(404, 'Anggaran tidak ditemukan.');
    list.splice(idx, 1);
    res.json({ ok: true, id: budgetId });
  })
);

// ============================================================================
// Shared Notes (Catatan Bersama Pasangan)
// ============================================================================
app.get(
  '/api/notes',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    if (pool) {
      const r = await pool.query(
        `SELECT n.id, n.couple_id AS "coupleId", n.author_partner_id AS "authorPartnerId", p.name AS "authorName",
                n.category_id AS "categoryId", n.title, n.content, n.is_pinned AS "isPinned", n.updated_at AS "updatedAt"
         FROM shared_notes n JOIN partners p ON p.id = n.author_partner_id
         WHERE n.couple_id=$1 ORDER BY n.is_pinned DESC, n.updated_at DESC`,
        [coupleId]
      );
      return res.json(r.rows);
    }
    const notes = [...(mem.notes.get(coupleId) || [])]
      .sort(
        (a, b) => Number(b.isPinned) - Number(a.isPinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .map(hydrateMemNote);
    res.json(notes);
  })
);

app.post(
  '/api/notes',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId, id: authorPartnerId, name: authorName } = req.partner;
    const { title, content = '', categoryId = null, isPinned = false } = req.body || {};
    if (!title || String(title).trim().length < 2) {
      return res.status(400).json({ error: 'Judul catatan wajib diisi.' });
    }
    const cleanCategoryId =
      categoryId === undefined || categoryId === null || categoryId === ''
        ? null
        : assertUuid(categoryId, 'categoryId');

    if (cleanCategoryId) {
      if (pool) {
        const cRes = await pool.query('SELECT id FROM categories WHERE id = $1 AND couple_id = $2', [
          cleanCategoryId,
          coupleId,
        ]);
        if (!cRes.rowCount) {
          throw new HttpError(404, 'Kategori tidak ditemukan.');
        }
      } else {
        const cat = (mem.categories.get(coupleId) || []).find((c) => c.id === cleanCategoryId);
        if (!cat) throw new HttpError(404, 'Kategori tidak ditemukan.');
      }
    }

    const noteObj = {
      id: randomUUID(),
      coupleId,
      authorPartnerId,
      authorName,
      categoryId: cleanCategoryId,
      title: String(title).trim(),
      content: String(content || ''),
      isPinned: Boolean(isPinned),
      updatedAt: new Date().toISOString(),
    };
    if (pool) {
      await pool.query(
        'INSERT INTO shared_notes(id, couple_id, author_partner_id, category_id, title, content, is_pinned, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [noteObj.id, coupleId, authorPartnerId, noteObj.categoryId, noteObj.title, noteObj.content, noteObj.isPinned, noteObj.updatedAt]
      );
      return res.status(201).json(noteObj);
    }
    mem.notes.get(coupleId).push(noteObj);
    res.status(201).json(hydrateMemNote(noteObj));
  })
);

app.patch(
  '/api/notes/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const noteId = assertUuid(req.params.id, 'noteId');
    const body = req.body || {};

    if (body.title !== undefined && (!body.title || String(body.title).trim().length < 2)) {
      throw new HttpError(400, 'Judul catatan minimal 2 karakter.');
    }

    let hasCategoryChange = false;
    let requestedCategoryId = null;
    if ('categoryId' in body && body.categoryId !== undefined) {
      hasCategoryChange = true;
      requestedCategoryId =
        body.categoryId === null || body.categoryId === '' ? null : assertUuid(body.categoryId, 'categoryId');
    }

    if (pool) {
      const updated = await withPgTx(async (client) => {
        const curRes = await client.query(
          `SELECT id, couple_id AS "coupleId", author_partner_id AS "authorPartnerId",
                  category_id AS "categoryId", title, content, is_pinned AS "isPinned", updated_at AS "updatedAt"
           FROM shared_notes WHERE id = $1 AND couple_id = $2 FOR UPDATE`,
          [noteId, coupleId]
        );
        if (!curRes.rowCount) {
          throw new HttpError(404, 'Catatan tidak ditemukan.');
        }
        const cur = curRes.rows[0];
        const nextCategoryId = hasCategoryChange ? requestedCategoryId : cur.categoryId;
        if (nextCategoryId) {
          const cRes = await client.query('SELECT id FROM categories WHERE id = $1 AND couple_id = $2', [
            nextCategoryId,
            coupleId,
          ]);
          if (!cRes.rowCount) {
            throw new HttpError(404, 'Kategori tidak ditemukan.');
          }
        }
        const nextTitle = body.title !== undefined ? String(body.title).trim() : cur.title;
        const nextContent = body.content !== undefined ? String(body.content ?? '') : cur.content;
        const nextPinned = body.isPinned !== undefined ? Boolean(body.isPinned) : cur.isPinned;
        const nextUpdatedAt = new Date().toISOString();

        await client.query(
          `UPDATE shared_notes
           SET title = $1, content = $2, category_id = $3, is_pinned = $4, updated_at = $5
           WHERE id = $6 AND couple_id = $7`,
          [nextTitle, nextContent, nextCategoryId, nextPinned, nextUpdatedAt, noteId, coupleId]
        );

        const joined = await client.query(
          `SELECT n.id, n.couple_id AS "coupleId", n.author_partner_id AS "authorPartnerId", p.name AS "authorName",
                  n.category_id AS "categoryId", n.title, n.content, n.is_pinned AS "isPinned", n.updated_at AS "updatedAt"
           FROM shared_notes n JOIN partners p ON p.id = n.author_partner_id
           WHERE n.id = $1 AND n.couple_id = $2`,
          [noteId, coupleId]
        );
        return joined.rows[0];
      });
      return res.json(updated);
    }

    const list = mem.notes.get(coupleId) || [];
    const note = list.find((n) => n.id === noteId);
    if (!note) {
      throw new HttpError(404, 'Catatan tidak ditemukan.');
    }
    const nextCategoryId = hasCategoryChange ? requestedCategoryId : note.categoryId;
    if (nextCategoryId) {
      const cat = (mem.categories.get(coupleId) || []).find((c) => c.id === nextCategoryId);
      if (!cat) throw new HttpError(404, 'Kategori tidak ditemukan.');
    }

    if (body.title !== undefined) note.title = String(body.title).trim();
    if (body.content !== undefined) note.content = String(body.content ?? '');
    if (hasCategoryChange) note.categoryId = nextCategoryId;
    if (body.isPinned !== undefined) note.isPinned = Boolean(body.isPinned);
    note.updatedAt = new Date().toISOString();

    res.json(hydrateMemNote(note));
  })
);

app.delete(
  '/api/notes/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const noteId = assertUuid(req.params.id, 'noteId');

    if (pool) {
      const del = await pool.query('DELETE FROM shared_notes WHERE id = $1 AND couple_id = $2 RETURNING id', [
        noteId,
        coupleId,
      ]);
      if (!del.rowCount) {
        throw new HttpError(404, 'Catatan tidak ditemukan.');
      }
      return res.json({ ok: true, id: noteId });
    }

    const list = mem.notes.get(coupleId) || [];
    const idx = list.findIndex((n) => n.id === noteId);
    if (idx < 0) {
      throw new HttpError(404, 'Catatan tidak ditemukan.');
    }
    list.splice(idx, 1);
    res.json({ ok: true, id: noteId });
  })
);

// ============================================================================
// Summary & Monthly Analytics
// ============================================================================
app.get(
  '/api/summary',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const tz = parseTzOffset(req.query.tzOffset);
    const monthStr = validateMonth(req.query.month, { required: false });
    const bounds = monthStr ? getMonthBounds(monthStr, tz) : null;

    let partners = [];
    let categories = [];
    let transactions = [];

    if (pool) {
      const txQuery = bounds
        ? pool.query(
            'SELECT partner_id AS "partnerId", category_id AS "categoryId", type, amount::float8 AS amount FROM transactions WHERE couple_id=$1 AND occurred_at >= $2 AND occurred_at < $3',
            [coupleId, bounds.startIso, bounds.endIso]
          )
        : pool.query(
            'SELECT partner_id AS "partnerId", category_id AS "categoryId", type, amount::float8 AS amount FROM transactions WHERE couple_id=$1',
            [coupleId]
          );

      const [pRes, cRes, tRes] = await Promise.all([
        pool.query('SELECT id, name FROM partners WHERE couple_id=$1 ORDER BY created_at ASC', [coupleId]),
        pool.query(
          'SELECT id, name, icon, color, target_amount::float8 AS "targetAmount" FROM categories WHERE couple_id=$1 ORDER BY is_default DESC, created_at ASC',
          [coupleId]
        ),
        txQuery,
      ]);
      partners = pRes.rows;
      categories = cRes.rows;
      transactions = tRes.rows;
    } else {
      partners = Array.from(mem.partners.values())
        .filter((p) => p.coupleId === coupleId)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      categories = mem.categories.get(coupleId) || [];
      transactions = (mem.transactions.get(coupleId) || []).filter((tx) => {
        if (!bounds) return true;
        const ms = new Date(tx.occurredAt).getTime();
        return ms >= bounds.startMs && ms < bounds.endMs;
      });
    }

    const payload = buildSummaryPayload(monthStr, partners, categories, transactions);
    res.json(payload);
  })
);

app.get(
  '/api/analytics',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const tz = parseTzOffset(req.query.tzOffset);
    const monthStr = validateMonth(req.query.month, { required: true, defaultTzOffset: tz });
    const bounds = getMonthBounds(monthStr, tz);

    let partners = [];
    let categories = [];
    let accounts = [];
    let transactions = [];

    if (pool) {
      const [pRes, cRes, aRes, tRes] = await Promise.all([
        pool.query(
          'SELECT id, name, role_label AS "roleLabel", avatar_color AS "avatarColor" FROM partners WHERE couple_id = $1 ORDER BY created_at ASC',
          [coupleId]
        ),
        pool.query(
          'SELECT id, name, icon, color, target_amount::float8 AS "targetAmount" FROM categories WHERE couple_id = $1 ORDER BY is_default DESC, created_at ASC',
          [coupleId]
        ),
        pool.query(
          'SELECT id, is_shared AS "isShared", balance::float8 AS balance FROM accounts WHERE couple_id = $1',
          [coupleId]
        ),
        pool.query(
          'SELECT partner_id AS "partnerId", category_id AS "categoryId", type, amount::float8 AS amount FROM transactions WHERE couple_id = $1 AND occurred_at >= $2 AND occurred_at < $3',
          [coupleId, bounds.startIso, bounds.endIso]
        ),
      ]);
      partners = pRes.rows;
      categories = cRes.rows;
      accounts = aRes.rows;
      transactions = tRes.rows;
    } else {
      partners = Array.from(mem.partners.values())
        .filter((p) => p.coupleId === coupleId)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      categories = mem.categories.get(coupleId) || [];
      accounts = mem.accounts.get(coupleId) || [];
      transactions = (mem.transactions.get(coupleId) || []).filter((tx) => {
        const ms = new Date(tx.occurredAt).getTime();
        return ms >= bounds.startMs && ms < bounds.endMs;
      });
    }

    res.json(buildAnalyticsPayload(monthStr, partners, categories, accounts, transactions));
  })
);

function escapeCsvCell(value) {
  const raw = String(value ?? '');
  const s = /^[\t\r\n ]*[=+\-@]|^[\t\r\n]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

app.get(
  '/api/export',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const tz = parseTzOffset(req.query.tzOffset);
    const monthStr = validateMonth(req.query.month, { required: true, defaultTzOffset: tz });
    const bounds = getMonthBounds(monthStr, tz);
    const format = String(req.query.format || 'json').trim().toLowerCase();
    if (!['json', 'csv'].includes(format)) {
      throw new HttpError(400, 'Format ekspor harus json atau csv.');
    }

    let couple;
    let partners = [];
    let categories = [];
    let accounts = [];
    let transactions = [];
    let budgetRows = [];
    let transfers = [];

    if (pool) {
      const [cSpaceRes, pRes, cRes, aRes, tRes, bRes, trRes] = await Promise.all([
        pool.query('SELECT id, couple_name AS "coupleName", invite_code AS "inviteCode" FROM couples WHERE id = $1', [
          coupleId,
        ]),
        pool.query(
          'SELECT id, couple_id AS "coupleId", name, role_label AS "roleLabel", avatar_color AS "avatarColor" FROM partners WHERE couple_id = $1 ORDER BY created_at ASC',
          [coupleId]
        ),
        pool.query(
          'SELECT id, name, icon, color, target_amount::float8 AS "targetAmount" FROM categories WHERE couple_id = $1 ORDER BY is_default DESC, created_at ASC',
          [coupleId]
        ),
        pool.query(
          'SELECT id, is_shared AS "isShared", balance::float8 AS balance FROM accounts WHERE couple_id = $1',
          [coupleId]
        ),
        pool.query(
          `SELECT t.id, t.couple_id AS "coupleId", t.partner_id AS "partnerId", p.name AS "partnerName",
                  t.category_id AS "categoryId", c.name AS "categoryName", c.icon AS "categoryIcon",
                  t.account_id AS "accountId", a.name AS "accountName", a.icon AS "accountIcon",
                  t.type, t.amount::float8 AS amount, t.note, t.occurred_at AS "occurredAt"
           FROM transactions t
           JOIN partners p ON p.id = t.partner_id
           JOIN categories c ON c.id = t.category_id
           LEFT JOIN accounts a ON a.id = t.account_id
           WHERE t.couple_id = $1 AND t.occurred_at >= $2 AND t.occurred_at < $3
           ORDER BY t.occurred_at DESC, t.created_at DESC`,
          [coupleId, bounds.startIso, bounds.endIso]
        ),
        pool.query(
          `SELECT b.id, b.couple_id AS "coupleId", b.category_id AS "categoryId",
                  c.name AS "categoryName", c.icon AS "categoryIcon", c.color AS "categoryColor",
                  b.month, b.limit_amount::float8 AS "limitAmount"
           FROM budgets b
           JOIN categories c ON c.id = b.category_id
           WHERE b.couple_id = $1 AND b.month = $2
           ORDER BY c.name ASC`,
          [coupleId, monthStr]
        ),
        pool.query(
          `SELECT t.id, t.couple_id AS "coupleId", t.partner_id AS "partnerId", p.name AS "partnerName",
                  t.from_account_id AS "fromAccountId", fa.name AS "fromAccountName", fa.icon AS "fromAccountIcon",
                  t.to_account_id AS "toAccountId", ta.name AS "toAccountName", ta.icon AS "toAccountIcon",
                  t.amount::float8 AS amount, t.note, t.occurred_at AS "occurredAt", t.created_at AS "createdAt"
           FROM account_transfers t
           JOIN partners p ON p.id = t.partner_id
           LEFT JOIN accounts fa ON fa.id = t.from_account_id
           LEFT JOIN accounts ta ON ta.id = t.to_account_id
           WHERE t.couple_id = $1 AND t.occurred_at >= $2 AND t.occurred_at < $3
           ORDER BY t.occurred_at DESC, t.created_at DESC`,
          [coupleId, bounds.startIso, bounds.endIso]
        ),
      ]);
      couple = { ...cSpaceRes.rows[0], partners: pRes.rows };
      partners = pRes.rows;
      categories = cRes.rows;
      accounts = aRes.rows;
      transactions = tRes.rows;
      budgetRows = bRes.rows;
      transfers = trRes.rows;
    } else {
      const memCouple = mem.couples.get(coupleId);
      partners = Array.from(mem.partners.values())
        .filter((p) => p.coupleId === coupleId)
        .sort((a, b) => a.createdAtMs - b.createdAtMs)
        .map(({ id, coupleId: cId, name, roleLabel, avatarColor }) => ({
          id,
          coupleId: cId,
          name,
          roleLabel,
          avatarColor,
        }));
      couple = { ...memCouple, partners };
      categories = mem.categories.get(coupleId) || [];
      accounts = mem.accounts.get(coupleId) || [];
      transactions = [...(mem.transactions.get(coupleId) || [])]
        .filter((tx) => {
          const ms = new Date(tx.occurredAt).getTime();
          return ms >= bounds.startMs && ms < bounds.endMs;
        })
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || b.createdAtMs - a.createdAtMs)
        .map((tx) => hydrateMemTx(tx, coupleId));
      const catById = new Map(categories.map((c) => [c.id, c]));
      budgetRows = (mem.budgets.get(coupleId) || [])
        .filter((b) => b.month === monthStr)
        .map((b) => {
          const cat = catById.get(b.categoryId);
          return {
            id: b.id,
            coupleId: b.coupleId,
            categoryId: b.categoryId,
            categoryName: cat ? cat.name : '',
            categoryIcon: cat ? cat.icon : '✨',
            categoryColor: cat ? cat.color : DEFAULT_CATEGORY_COLOR,
            month: b.month,
            limitAmount: b.limitAmount,
          };
        })
        .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
      transfers = [...(mem.transfers.get(coupleId) || [])]
        .filter((tr) => {
          const ms = new Date(tr.occurredAt).getTime();
          return ms >= bounds.startMs && ms < bounds.endMs;
        })
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || b.createdAtMs - a.createdAtMs)
        .map((tr) => hydrateMemTransfer(tr, coupleId));
    }

    if (format === 'csv') {
      const header = ['Tanggal', 'Tipe', 'Kategori', 'Dompet', 'Pasangan', 'Nominal', 'Catatan'].join(',');
      const lines = transactions.map((tx) =>
        [
          new Date(new Date(tx.occurredAt).getTime() + tz * 60_000).toISOString().slice(0, 10),
          tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
          tx.categoryName,
          tx.accountName || 'Tanpa Dompet',
          tx.partnerName,
          roundMoney(tx.amount),
          tx.note || '',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
      const csvBody = [header, ...lines].join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="duasaku-${monthStr}.csv"`);
      return res.send(csvBody);
    }

    let totalIncome = 0;
    let totalExpense = 0;
    const spentMap = new Map();
    for (const tx of transactions) {
      const amt = roundMoney(tx.amount);
      if (tx.type === 'income') {
        totalIncome = roundMoney(totalIncome + amt);
      } else {
        totalExpense = roundMoney(totalExpense + amt);
        spentMap.set(tx.categoryId, roundMoney((spentMap.get(tx.categoryId) || 0) + amt));
      }
    }
    const netBalance = roundMoney(totalIncome - totalExpense);
    const budgets = budgetRows.map((row) => buildMonthlyBudget(row, spentMap.get(row.categoryId) || 0));

    res.setHeader('Content-Disposition', `attachment; filename="duasaku-${monthStr}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      month: monthStr,
      tzOffset: tz,
      couple,
      summary: {
        month: monthStr,
        totalIncome,
        totalExpense,
        netBalance,
      },
      analytics: {
        month: monthStr,
        totals: {
          totalIncome,
          totalExpense,
          netBalance,
          savingsRate: totalIncome > 0 ? Math.round((netBalance / totalIncome) * 1000) / 10 : 0,
          transactionCount: transactions.length,
        },
        accountsOverview: {
          ...computeAccountTotals(accounts),
          accountsCount: accounts.length,
        },
      },
      budgets,
      transactions,
      transfers,
    });
  })
);

const RECURRING_SELECT_SQL = `
  SELECT r.id, r.couple_id AS "coupleId", r.title, r.type, r.amount::float8 AS amount,
         r.category_id AS "categoryId", c.name AS "categoryName", c.icon AS "categoryIcon",
         r.account_id AS "accountId", a.name AS "accountName", a.icon AS "accountIcon",
         r.frequency, r.next_due_date AS "nextDueDate", r.active,
         r.created_by AS "createdBy", p.name AS "createdByName", r.created_at AS "createdAt"
  FROM recurring_rules r
  JOIN categories c ON c.id = r.category_id
  LEFT JOIN accounts a ON a.id = r.account_id
  JOIN partners p ON p.id = r.created_by
`;

const DEBT_SELECT_SQL = `
  SELECT d.id, d.couple_id AS "coupleId", d.person_name AS "personName", d.direction,
         d.amount::float8 AS amount, d.paid_amount::float8 AS "paidAmount",
         d.note, d.due_date AS "dueDate", d.settled,
         d.created_by AS "createdBy", p.name AS "createdByName", d.created_at AS "createdAt"
  FROM debt_loans d
  JOIN partners p ON p.id = d.created_by
`;

const PRESET_SELECT_SQL = `
  SELECT q.id, q.couple_id AS "coupleId", q.label, q.type, q.amount::float8 AS amount,
         q.category_id AS "categoryId", c.name AS "categoryName", c.icon AS "categoryIcon",
         q.account_id AS "accountId", a.name AS "accountName", a.icon AS "accountIcon",
         q.note, q.created_at AS "createdAt"
  FROM quick_presets q
  LEFT JOIN categories c ON c.id = q.category_id
  LEFT JOIN accounts a ON a.id = q.account_id
`;

function mapPgDebtRow(row) {
  const amount = roundMoney(row.amount);
  const paidAmount = roundMoney(row.paidAmount);
  return {
    ...row,
    amount,
    paidAmount,
    remainingAmount: roundMoney(Math.max(0, amount - paidAmount)),
    dueDate: row.dueDate ?? null,
    settled: Boolean(row.settled),
  };
}

// ============================================================================
// Bootstrap (Consolidated Domain Payload for Couple Space)
// ============================================================================
app.get(
  '/api/bootstrap',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const tz = parseTzOffset(req.query.tzOffset);
    const monthStr = validateMonth(req.query.month, { required: true, defaultTzOffset: tz });
    const bounds = getMonthBounds(monthStr, tz);

    if (pool) {
      const [
        cRes,
        pRes,
        catRes,
        accRes,
        trRes,
        txRes,
        bdgRes,
        noteRes,
        recRes,
        debtRes,
        presetRes,
      ] = await Promise.all([
        pool.query('SELECT id, couple_name AS "coupleName", invite_code AS "inviteCode" FROM couples WHERE id = $1', [
          coupleId,
        ]),
        pool.query(
          'SELECT id, couple_id AS "coupleId", name, role_label AS "roleLabel", avatar_color AS "avatarColor" FROM partners WHERE couple_id = $1 ORDER BY created_at ASC',
          [coupleId]
        ),
        pool.query(
          'SELECT id, couple_id AS "coupleId", name, icon, color, target_amount::float8 AS "targetAmount", is_default AS "isDefault" FROM categories WHERE couple_id = $1 ORDER BY is_default DESC, created_at ASC',
          [coupleId]
        ),
        pool.query(
          `SELECT a.id, a.couple_id AS "coupleId", a.owner_partner_id AS "ownerPartnerId",
                  p.name AS "ownerPartnerName", a.name, a.account_type AS "accountType",
                  a.is_shared AS "isShared", a.initial_balance::float8 AS "initialBalance",
                  a.balance::float8 AS balance, a.icon, a.color, a.created_at AS "createdAt"
           FROM accounts a
           LEFT JOIN partners p ON p.id = a.owner_partner_id
           WHERE a.couple_id = $1
           ORDER BY a.is_shared DESC, a.created_at ASC`,
          [coupleId]
        ),
        pool.query(
          `SELECT t.id, t.couple_id AS "coupleId", t.partner_id AS "partnerId", p.name AS "partnerName",
                  t.from_account_id AS "fromAccountId", fa.name AS "fromAccountName", fa.icon AS "fromAccountIcon",
                  t.to_account_id AS "toAccountId", ta.name AS "toAccountName", ta.icon AS "toAccountIcon",
                  t.amount::float8 AS amount, t.note, t.occurred_at AS "occurredAt", t.created_at AS "createdAt"
           FROM account_transfers t
           JOIN partners p ON p.id = t.partner_id
           LEFT JOIN accounts fa ON fa.id = t.from_account_id
           LEFT JOIN accounts ta ON ta.id = t.to_account_id
           WHERE t.couple_id = $1 AND t.occurred_at >= $2 AND t.occurred_at < $3
           ORDER BY t.occurred_at DESC, t.created_at DESC`,
          [coupleId, bounds.startIso, bounds.endIso]
        ),
        pool.query(
          `SELECT t.id, t.couple_id AS "coupleId", t.partner_id AS "partnerId", p.name AS "partnerName",
                  t.category_id AS "categoryId", c.name AS "categoryName", c.icon AS "categoryIcon",
                  t.account_id AS "accountId", a.name AS "accountName", a.icon AS "accountIcon",
                  t.type, t.amount::float8 AS amount, t.note, t.occurred_at AS "occurredAt"
           FROM transactions t
           JOIN partners p ON p.id = t.partner_id
           JOIN categories c ON c.id = t.category_id
           LEFT JOIN accounts a ON a.id = t.account_id
           WHERE t.couple_id = $1 AND t.occurred_at >= $2 AND t.occurred_at < $3
           ORDER BY t.occurred_at DESC, t.created_at DESC`,
          [coupleId, bounds.startIso, bounds.endIso]
        ),
        pool.query(
          `SELECT b.id, b.couple_id AS "coupleId", b.category_id AS "categoryId",
                  c.name AS "categoryName", c.icon AS "categoryIcon", c.color AS "categoryColor",
                  b.month, b.limit_amount::float8 AS "limitAmount"
           FROM budgets b
           JOIN categories c ON c.id = b.category_id
           WHERE b.couple_id = $1 AND b.month = $2
           ORDER BY c.name ASC`,
          [coupleId, monthStr]
        ),
        pool.query(
          `SELECT n.id, n.couple_id AS "coupleId", n.author_partner_id AS "authorPartnerId", p.name AS "authorName",
                  n.category_id AS "categoryId", n.title, n.content, n.is_pinned AS "isPinned", n.updated_at AS "updatedAt"
           FROM shared_notes n JOIN partners p ON p.id = n.author_partner_id
           WHERE n.couple_id = $1 ORDER BY n.is_pinned DESC, n.updated_at DESC`,
          [coupleId]
        ),
        pool.query(`${RECURRING_SELECT_SQL} WHERE r.couple_id = $1 ORDER BY r.next_due_date ASC, r.created_at ASC`, [
          coupleId,
        ]),
        pool.query(`${DEBT_SELECT_SQL} WHERE d.couple_id = $1 ORDER BY d.settled ASC, d.created_at DESC`, [coupleId]),
        pool.query(`${PRESET_SELECT_SQL} WHERE q.couple_id = $1 ORDER BY q.created_at ASC`, [coupleId]),
      ]);

      const partners = pRes.rows;
      const categories = catRes.rows;
      const accounts = accRes.rows;
      const transactions = txRes.rows;
      const spentMap = new Map();
      for (const tx of transactions) {
        if (tx.type === 'expense') {
          spentMap.set(tx.categoryId, roundMoney((spentMap.get(tx.categoryId) || 0) + roundMoney(tx.amount)));
        }
      }
      const budgets = bdgRes.rows.map((row) => buildMonthlyBudget(row, spentMap.get(row.categoryId) || 0));
      const totalLimit = roundMoney(budgets.reduce((s, b) => s + b.limitAmount, 0));
      const totalSpent = roundMoney(budgets.reduce((s, b) => s + b.spent, 0));

      return res.json({
        month: monthStr,
        couple: { ...cRes.rows[0], partners },
        categories,
        accounts,
        accountTotals: computeAccountTotals(accounts),
        transfers: trRes.rows,
        transactions,
        budgets,
        budgetTotals: {
          month: monthStr,
          totalLimit,
          totalSpent,
          totalRemaining: roundMoney(totalLimit - totalSpent),
        },
        summary: buildSummaryPayload(monthStr, partners, categories, transactions),
        analytics: buildAnalyticsPayload(monthStr, partners, categories, accounts, transactions),
        notes: noteRes.rows,
        recurringRules: recRes.rows,
        debtLoans: debtRes.rows.map(mapPgDebtRow),
        quickPresets: presetRes.rows,
      });
    }

    const memCouple = mem.couples.get(coupleId);
    const partnersRaw = Array.from(mem.partners.values())
      .filter((p) => p.coupleId === coupleId)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
    const partners = partnersRaw.map(({ id, coupleId: cId, name, roleLabel, avatarColor }) => ({
      id,
      coupleId: cId,
      name,
      roleLabel,
      avatarColor,
    }));
    const categories = (mem.categories.get(coupleId) || []).map(
      ({ id, coupleId: cId, name, icon, color, targetAmount, isDefault }) => ({
        id,
        coupleId: cId,
        name,
        icon,
        color,
        targetAmount,
        isDefault,
      })
    );
    const accounts = [...(mem.accounts.get(coupleId) || [])]
      .sort((a, b) => Number(b.isShared) - Number(a.isShared) || a.createdAtMs - b.createdAtMs)
      .map(hydrateMemAccount);
    const transfers = [...(mem.transfers.get(coupleId) || [])]
      .filter((tr) => {
        const ms = new Date(tr.occurredAt).getTime();
        return ms >= bounds.startMs && ms < bounds.endMs;
      })
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || b.createdAtMs - a.createdAtMs)
      .map((tr) => hydrateMemTransfer(tr, coupleId));
    const transactions = [...(mem.transactions.get(coupleId) || [])]
      .filter((tx) => {
        const ms = new Date(tx.occurredAt).getTime();
        return ms >= bounds.startMs && ms < bounds.endMs;
      })
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || b.createdAtMs - a.createdAtMs)
      .map((tx) => hydrateMemTx(tx, coupleId));

    const catById = new Map(categories.map((c) => [c.id, c]));
    const spentMap = new Map();
    for (const tx of transactions) {
      if (tx.type === 'expense') {
        spentMap.set(tx.categoryId, roundMoney((spentMap.get(tx.categoryId) || 0) + tx.amount));
      }
    }
    const budgets = (mem.budgets.get(coupleId) || [])
      .filter((b) => b.month === monthStr)
      .map((b) => {
        const cat = catById.get(b.categoryId);
        return buildMonthlyBudget(
          {
            id: b.id,
            coupleId: b.coupleId,
            categoryId: b.categoryId,
            categoryName: cat ? cat.name : '',
            categoryIcon: cat ? cat.icon : '✨',
            categoryColor: cat ? cat.color : DEFAULT_CATEGORY_COLOR,
            month: b.month,
            limitAmount: b.limitAmount,
          },
          spentMap.get(b.categoryId) || 0
        );
      })
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    const totalLimit = roundMoney(budgets.reduce((s, b) => s + b.limitAmount, 0));
    const totalSpent = roundMoney(budgets.reduce((s, b) => s + b.spent, 0));

    const notes = [...(mem.notes.get(coupleId) || [])]
      .sort(
        (a, b) => Number(b.isPinned) - Number(a.isPinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .map(hydrateMemNote);

    const recurringRules = [...(mem.recurringRules.get(coupleId) || [])]
      .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate) || a.createdAtMs - b.createdAtMs)
      .map((r) => hydrateMemRecurringRule(r, coupleId));

    const debtLoans = [...(mem.debtLoans.get(coupleId) || [])]
      .sort((a, b) => Number(a.settled) - Number(b.settled) || b.createdAtMs - a.createdAtMs)
      .map(hydrateMemDebtLoan);

    const quickPresets = [...(mem.quickPresets.get(coupleId) || [])]
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .map((p) => hydrateMemQuickPreset(p, coupleId));

    res.json({
      month: monthStr,
      couple: { ...memCouple, partners },
      categories,
      accounts,
      accountTotals: computeAccountTotals(accounts),
      transfers,
      transactions,
      budgets,
      budgetTotals: {
        month: monthStr,
        totalLimit,
        totalSpent,
        totalRemaining: roundMoney(totalLimit - totalSpent),
      },
      summary: buildSummaryPayload(monthStr, partners, categories, transactions),
      analytics: buildAnalyticsPayload(monthStr, partners, categories, accounts, transactions),
      notes,
      recurringRules,
      debtLoans,
      quickPresets,
    });
  })
);

// ============================================================================
// Recurring Bills & Transactions
// ============================================================================
app.get(
  '/api/recurring',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    if (pool) {
      const r = await pool.query(
        `${RECURRING_SELECT_SQL} WHERE r.couple_id = $1 ORDER BY r.next_due_date ASC, r.created_at ASC`,
        [coupleId]
      );
      return res.json(r.rows);
    }
    const rules = [...(mem.recurringRules.get(coupleId) || [])]
      .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate) || a.createdAtMs - b.createdAtMs)
      .map((r) => hydrateMemRecurringRule(r, coupleId));
    res.json(rules);
  })
);

app.post(
  '/api/recurring',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId, id: createdBy, name: createdByName } = req.partner;
    const body = req.body || {};

    const cleanTitle = parseRequiredText(body.title, 'Judul tagihan rutin wajib diisi.');
    if (!['income', 'expense'].includes(body.type)) {
      throw new HttpError(400, 'Tipe transaksi tagihan rutin harus income atau expense.');
    }
    const numericAmount = parseStrictNumber(body.amount, 'Nominal tagihan rutin harus lebih dari 0.', {
      exclusiveMin: 0,
    });
    const rawCategoryId = body.categoryId !== undefined ? body.categoryId : body.category_id;
    const cleanCategoryId = assertUuid(rawCategoryId, 'categoryId');
    const rawAccountId = body.accountId !== undefined ? body.accountId : body.account_id;
    const cleanAccountId =
      rawAccountId === undefined || rawAccountId === null || rawAccountId === ''
        ? null
        : assertUuid(rawAccountId, 'accountId');
    if (!RECURRING_FREQUENCIES.includes(body.frequency)) {
      throw new HttpError(400, 'Frekuensi harus weekly, monthly, atau yearly.');
    }
    const rawNextDue = body.nextDueDate !== undefined ? body.nextDueDate : body.next_due_date;
    const cleanNextDueDate = parseDateYmd(rawNextDue, 'Format tanggal jatuh tempo harus YYYY-MM-DD.', {
      allowUndefined: true,
    });
    if (body.active !== undefined && typeof body.active !== 'boolean') {
      throw new HttpError(400, 'Status active harus berupa boolean.');
    }
    const isActive = body.active === undefined ? true : body.active;
    const id = randomUUID();
    const createdAtIso = new Date().toISOString();

    if (pool) {
      const rule = await withPgTx(async (client) => {
        const cRes = await client.query('SELECT id FROM categories WHERE id = $1 AND couple_id = $2', [
          cleanCategoryId,
          coupleId,
        ]);
        if (!cRes.rowCount) {
          throw new HttpError(404, 'Kategori tidak ditemukan.');
        }
        if (cleanAccountId) {
          const aRes = await client.query('SELECT id FROM accounts WHERE id = $1 AND couple_id = $2', [
            cleanAccountId,
            coupleId,
          ]);
          if (!aRes.rowCount) {
            throw new HttpError(404, 'Akun tidak ditemukan.');
          }
        }
        await client.query(
          `INSERT INTO recurring_rules(id, couple_id, title, type, amount, category_id, account_id, frequency, next_due_date, active, created_by, created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            id,
            coupleId,
            cleanTitle,
            body.type,
            numericAmount,
            cleanCategoryId,
            cleanAccountId,
            body.frequency,
            cleanNextDueDate,
            isActive,
            createdBy,
            createdAtIso,
          ]
        );
        const joined = await client.query(`${RECURRING_SELECT_SQL} WHERE r.id = $1 AND r.couple_id = $2`, [
          id,
          coupleId,
        ]);
        return joined.rows[0];
      });
      return res.status(201).json(rule);
    }

    const cat = (mem.categories.get(coupleId) || []).find((c) => c.id === cleanCategoryId);
    if (!cat) throw new HttpError(404, 'Kategori tidak ditemukan.');
    if (cleanAccountId) {
      const acc = (mem.accounts.get(coupleId) || []).find((a) => a.id === cleanAccountId);
      if (!acc) throw new HttpError(404, 'Akun tidak ditemukan.');
    }

    if (!mem.recurringRules.has(coupleId)) mem.recurringRules.set(coupleId, []);
    const ruleObj = {
      id,
      coupleId,
      title: cleanTitle,
      type: body.type,
      amount: numericAmount,
      categoryId: cleanCategoryId,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      accountId: cleanAccountId,
      frequency: body.frequency,
      nextDueDate: cleanNextDueDate,
      active: isActive,
      createdBy,
      createdByName,
      createdAt: createdAtIso,
      createdAtMs: Date.now(),
    };
    mem.recurringRules.get(coupleId).push(ruleObj);
    res.status(201).json(hydrateMemRecurringRule(ruleObj, coupleId));
  })
);

app.patch(
  '/api/recurring/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const ruleId = assertUuid(req.params.id, 'recurringRuleId');
    const body = req.body || {};

    let nextTitle;
    if (body.title !== undefined) {
      nextTitle = parseRequiredText(body.title, 'Judul tagihan rutin wajib diisi.');
    }
    if (body.type !== undefined && !['income', 'expense'].includes(body.type)) {
      throw new HttpError(400, 'Tipe transaksi tagihan rutin harus income atau expense.');
    }
    let nextAmount;
    if (body.amount !== undefined) {
      nextAmount = parseStrictNumber(body.amount, 'Nominal tagihan rutin harus lebih dari 0.', {
        exclusiveMin: 0,
      });
    }
    let nextCategoryId;
    const hasCategory = body.categoryId !== undefined || body.category_id !== undefined;
    if (hasCategory) {
      nextCategoryId = assertUuid(body.categoryId !== undefined ? body.categoryId : body.category_id, 'categoryId');
    }
    const hasAccount = 'accountId' in body || 'account_id' in body;
    let nextAccountId;
    if (hasAccount) {
      const rawAcc = 'accountId' in body ? body.accountId : body.account_id;
      nextAccountId = rawAcc === null || rawAcc === '' || rawAcc === undefined ? null : assertUuid(rawAcc, 'accountId');
    }
    if (body.frequency !== undefined && !RECURRING_FREQUENCIES.includes(body.frequency)) {
      throw new HttpError(400, 'Frekuensi harus weekly, monthly, atau yearly.');
    }
    const hasNextDue = body.nextDueDate !== undefined || body.next_due_date !== undefined;
    let nextDueDate;
    if (hasNextDue) {
      nextDueDate = parseDateYmd(
        body.nextDueDate !== undefined ? body.nextDueDate : body.next_due_date,
        'Format tanggal jatuh tempo harus YYYY-MM-DD.'
      );
    }
    if (body.active !== undefined && typeof body.active !== 'boolean') {
      throw new HttpError(400, 'Status active harus berupa boolean.');
    }
    const isEmptyPatch = Object.keys(body).length === 0;

    if (pool) {
      const updated = await withPgTx(async (client) => {
        const curRes = await client.query(
          `SELECT id, title, type, amount::float8 AS amount, category_id AS "categoryId",
                  account_id AS "accountId", frequency, next_due_date AS "nextDueDate", active
           FROM recurring_rules WHERE id = $1 AND couple_id = $2 FOR UPDATE`,
          [ruleId, coupleId]
        );
        if (!curRes.rowCount) {
          throw new HttpError(404, 'Aturan tagihan rutin tidak ditemukan.');
        }
        const cur = curRes.rows[0];
        const finalCategoryId = hasCategory ? nextCategoryId : cur.categoryId;
        const finalAccountId = hasAccount ? nextAccountId : cur.accountId;

        if (hasCategory && finalCategoryId !== cur.categoryId) {
          const cRes = await client.query('SELECT id FROM categories WHERE id = $1 AND couple_id = $2', [
            finalCategoryId,
            coupleId,
          ]);
          if (!cRes.rowCount) throw new HttpError(404, 'Kategori tidak ditemukan.');
        }
        if (hasAccount && finalAccountId && finalAccountId !== cur.accountId) {
          const aRes = await client.query('SELECT id FROM accounts WHERE id = $1 AND couple_id = $2', [
            finalAccountId,
            coupleId,
          ]);
          if (!aRes.rowCount) throw new HttpError(404, 'Akun tidak ditemukan.');
        }

        const finalActive = isEmptyPatch
          ? !cur.active
          : body.active !== undefined
            ? body.active
            : cur.active;

        await client.query(
          `UPDATE recurring_rules
           SET title = $1, type = $2, amount = $3, category_id = $4, account_id = $5,
               frequency = $6, next_due_date = $7, active = $8
           WHERE id = $9 AND couple_id = $10`,
          [
            nextTitle !== undefined ? nextTitle : cur.title,
            body.type !== undefined ? body.type : cur.type,
            nextAmount !== undefined ? nextAmount : roundMoney(cur.amount),
            finalCategoryId,
            finalAccountId,
            body.frequency !== undefined ? body.frequency : cur.frequency,
            hasNextDue ? nextDueDate : cur.nextDueDate,
            finalActive,
            ruleId,
            coupleId,
          ]
        );
        const joined = await client.query(`${RECURRING_SELECT_SQL} WHERE r.id = $1 AND r.couple_id = $2`, [
          ruleId,
          coupleId,
        ]);
        return joined.rows[0];
      });
      return res.json(updated);
    }

    const list = mem.recurringRules.get(coupleId) || [];
    const rule = list.find((r) => r.id === ruleId);
    if (!rule) throw new HttpError(404, 'Aturan tagihan rutin tidak ditemukan.');

    if (hasCategory) {
      const cat = (mem.categories.get(coupleId) || []).find((c) => c.id === nextCategoryId);
      if (!cat) throw new HttpError(404, 'Kategori tidak ditemukan.');
      rule.categoryId = nextCategoryId;
      rule.categoryName = cat.name;
      rule.categoryIcon = cat.icon;
    }
    if (hasAccount) {
      if (nextAccountId) {
        const acc = (mem.accounts.get(coupleId) || []).find((a) => a.id === nextAccountId);
        if (!acc) throw new HttpError(404, 'Akun tidak ditemukan.');
      }
      rule.accountId = nextAccountId;
    }
    if (nextTitle !== undefined) rule.title = nextTitle;
    if (body.type !== undefined) rule.type = body.type;
    if (nextAmount !== undefined) rule.amount = nextAmount;
    if (body.frequency !== undefined) rule.frequency = body.frequency;
    if (hasNextDue) rule.nextDueDate = nextDueDate;
    if (isEmptyPatch) rule.active = !rule.active;
    else if (body.active !== undefined) rule.active = body.active;

    res.json(hydrateMemRecurringRule(rule, coupleId));
  })
);

app.delete(
  '/api/recurring/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const ruleId = assertUuid(req.params.id, 'recurringRuleId');

    if (pool) {
      const del = await pool.query('DELETE FROM recurring_rules WHERE id = $1 AND couple_id = $2 RETURNING id', [
        ruleId,
        coupleId,
      ]);
      if (!del.rowCount) throw new HttpError(404, 'Aturan tagihan rutin tidak ditemukan.');
      return res.json({ ok: true, id: ruleId });
    }

    const list = mem.recurringRules.get(coupleId) || [];
    const idx = list.findIndex((r) => r.id === ruleId);
    if (idx < 0) throw new HttpError(404, 'Aturan tagihan rutin tidak ditemukan.');
    list.splice(idx, 1);
    res.json({ ok: true, id: ruleId });
  })
);

app.post(
  '/api/recurring/:id/pay',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId, id: partnerId, name: partnerName } = req.partner;
    const ruleId = assertUuid(req.params.id, 'recurringRuleId');
    const body = req.body || {};

    const hasOccurredAt = body.occurredAt !== undefined;
    const hasDate = body.date !== undefined;
    const rawDate = hasOccurredAt ? body.occurredAt : body.date;
    const isoDate = parseOccurredAt(rawDate, { allowUndefined: !hasOccurredAt && !hasDate });

    const hasAccountOverride = 'accountId' in body && body.accountId !== undefined;
    const overrideAccountId = hasAccountOverride
      ? body.accountId === null || body.accountId === ''
        ? null
        : assertUuid(body.accountId, 'accountId')
      : undefined;
    const overrideAmount =
      body.amount !== undefined
        ? parseStrictNumber(body.amount, 'Nominal pembayaran harus lebih dari 0.', { exclusiveMin: 0 })
        : undefined;

    const txId = randomUUID();

    if (pool) {
      const result = await withPgTx(async (client) => {
        const ruleRes = await client.query(
          `SELECT r.id, r.couple_id AS "coupleId", r.title, r.type, r.amount::float8 AS amount,
                  r.category_id AS "categoryId", c.name AS "categoryName", c.icon AS "categoryIcon",
                  r.account_id AS "accountId", r.frequency, r.next_due_date AS "nextDueDate",
                  r.active, r.created_by AS "createdBy"
           FROM recurring_rules r
           JOIN categories c ON c.id = r.category_id
           WHERE r.id = $1 AND r.couple_id = $2
           FOR UPDATE OF r`,
          [ruleId, coupleId]
        );
        if (!ruleRes.rowCount) {
          throw new HttpError(404, 'Aturan tagihan rutin tidak ditemukan.');
        }
        const rule = ruleRes.rows[0];
        const effectiveAccountId = hasAccountOverride ? overrideAccountId : rule.accountId;
        const effectiveAmount = overrideAmount !== undefined ? overrideAmount : roundMoney(rule.amount);
        const effectiveNote = body.note !== undefined ? String(body.note ?? '') : rule.title;

        let acc = null;
        if (effectiveAccountId) {
          const accRes = await client.query(
            'SELECT id, name, icon FROM accounts WHERE id = $1 AND couple_id = $2 FOR UPDATE',
            [effectiveAccountId, coupleId]
          );
          if (!accRes.rowCount) {
            throw new HttpError(404, 'Akun tidak ditemukan.');
          }
          acc = accRes.rows[0];
          await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND couple_id = $3', [
            signedDelta(rule.type, effectiveAmount),
            effectiveAccountId,
            coupleId,
          ]);
        }

        await client.query(
          `INSERT INTO transactions(id, couple_id, partner_id, category_id, account_id, type, amount, note, occurred_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            txId,
            coupleId,
            partnerId,
            rule.categoryId,
            effectiveAccountId,
            rule.type,
            effectiveAmount,
            effectiveNote,
            isoDate,
          ]
        );

        const advancedDue = advanceDueDate(rule.nextDueDate, rule.frequency);
        await client.query('UPDATE recurring_rules SET next_due_date = $1 WHERE id = $2 AND couple_id = $3', [
          advancedDue,
          ruleId,
          coupleId,
        ]);

        const updatedRuleRes = await client.query(`${RECURRING_SELECT_SQL} WHERE r.id = $1 AND r.couple_id = $2`, [
          ruleId,
          coupleId,
        ]);

        return {
          transaction: {
            id: txId,
            coupleId,
            partnerId,
            partnerName,
            categoryId: rule.categoryId,
            categoryName: rule.categoryName,
            categoryIcon: rule.categoryIcon,
            accountId: acc ? acc.id : null,
            accountName: acc ? acc.name : null,
            accountIcon: acc ? acc.icon : null,
            type: rule.type,
            amount: effectiveAmount,
            note: effectiveNote,
            occurredAt: isoDate,
          },
          rule: updatedRuleRes.rows[0],
        };
      });
      return res.status(201).json(result);
    }

    const rules = mem.recurringRules.get(coupleId) || [];
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) throw new HttpError(404, 'Aturan tagihan rutin tidak ditemukan.');

    const cat = (mem.categories.get(coupleId) || []).find((c) => c.id === rule.categoryId);
    if (!cat) throw new HttpError(404, 'Kategori tidak ditemukan.');

    const effectiveAccountId = hasAccountOverride ? overrideAccountId : rule.accountId;
    const effectiveAmount = overrideAmount !== undefined ? overrideAmount : roundMoney(rule.amount);
    const effectiveNote = body.note !== undefined ? String(body.note ?? '') : rule.title;

    let acc = null;
    if (effectiveAccountId) {
      acc = (mem.accounts.get(coupleId) || []).find((a) => a.id === effectiveAccountId);
      if (!acc) throw new HttpError(404, 'Akun tidak ditemukan.');
    }

    if (acc) {
      acc.balance = roundMoney(acc.balance + signedDelta(rule.type, effectiveAmount));
    }

    if (!mem.transactions.has(coupleId)) mem.transactions.set(coupleId, []);
    const tx = {
      id: txId,
      coupleId,
      partnerId,
      partnerName,
      categoryId: rule.categoryId,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      accountId: effectiveAccountId,
      type: rule.type,
      amount: effectiveAmount,
      note: effectiveNote,
      occurredAt: isoDate,
      createdAtMs: Date.now(),
    };
    mem.transactions.get(coupleId).push(tx);

    rule.nextDueDate = advanceDueDate(rule.nextDueDate, rule.frequency);

    res.status(201).json({
      transaction: hydrateMemTx(tx, coupleId),
      rule: hydrateMemRecurringRule(rule, coupleId),
    });
  })
);

// ============================================================================
// Debt / Loan & Split Tracking
// ============================================================================
app.get(
  '/api/debts',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    if (pool) {
      const r = await pool.query(`${DEBT_SELECT_SQL} WHERE d.couple_id = $1 ORDER BY d.settled ASC, d.created_at DESC`, [
        coupleId,
      ]);
      return res.json(r.rows.map(mapPgDebtRow));
    }
    const debts = [...(mem.debtLoans.get(coupleId) || [])]
      .sort((a, b) => Number(a.settled) - Number(b.settled) || b.createdAtMs - a.createdAtMs)
      .map(hydrateMemDebtLoan);
    res.json(debts);
  })
);

app.post(
  '/api/debts',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId, id: createdBy, name: createdByName } = req.partner;
    const body = req.body || {};

    const rawPerson = body.personName !== undefined ? body.personName : body.person_name;
    const cleanPersonName = parseRequiredText(rawPerson, 'Nama orang/pihak wajib diisi.');
    if (!DEBT_DIRECTIONS.includes(body.direction)) {
      throw new HttpError(400, 'Direction harus payable atau receivable.');
    }
    const numericAmount = parseStrictNumber(body.amount, 'Nominal hutang/piutang harus lebih dari 0.', {
      exclusiveMin: 0,
    });
    const rawDue = body.dueDate !== undefined ? body.dueDate : body.due_date;
    const cleanDueDate =
      rawDue === undefined || rawDue === null || rawDue === ''
        ? null
        : parseDateYmd(rawDue, 'Format tanggal jatuh tempo harus YYYY-MM-DD.');
    const cleanNote = String(body.note ?? '');
    const id = randomUUID();
    const createdAtIso = new Date().toISOString();

    if (pool) {
      await pool.query(
        `INSERT INTO debt_loans(id, couple_id, person_name, direction, amount, paid_amount, note, due_date, settled, created_by, created_at)
         VALUES($1,$2,$3,$4,$5,0,$6,$7,false,$8,$9)`,
        [id, coupleId, cleanPersonName, body.direction, numericAmount, cleanNote, cleanDueDate, createdBy, createdAtIso]
      );
      const r = await pool.query(`${DEBT_SELECT_SQL} WHERE d.id = $1 AND d.couple_id = $2`, [id, coupleId]);
      return res.status(201).json(mapPgDebtRow(r.rows[0]));
    }

    if (!mem.debtLoans.has(coupleId)) mem.debtLoans.set(coupleId, []);
    const debtObj = {
      id,
      coupleId,
      personName: cleanPersonName,
      direction: body.direction,
      amount: numericAmount,
      paidAmount: 0,
      note: cleanNote,
      dueDate: cleanDueDate,
      settled: false,
      createdBy,
      createdByName,
      createdAt: createdAtIso,
      createdAtMs: Date.now(),
    };
    mem.debtLoans.get(coupleId).push(debtObj);
    res.status(201).json(hydrateMemDebtLoan(debtObj));
  })
);

app.post(
  '/api/debts/:id/settle',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const debtId = assertUuid(req.params.id, 'debtId');
    const body = req.body || {};

    const hasExplicitAmount = body.amount !== undefined && body.amount !== null;
    const explicitAmount = hasExplicitAmount
      ? parseStrictNumber(body.amount, 'Nominal pembayaran harus lebih dari 0.', { exclusiveMin: 0 })
      : null;

    if (pool) {
      const updated = await withPgTx(async (client) => {
        const curRes = await client.query(
          `SELECT id, amount::float8 AS amount, paid_amount::float8 AS "paidAmount", settled
           FROM debt_loans WHERE id = $1 AND couple_id = $2 FOR UPDATE`,
          [debtId, coupleId]
        );
        if (!curRes.rowCount) {
          throw new HttpError(404, 'Catatan hutang/piutang tidak ditemukan.');
        }
        const cur = curRes.rows[0];
        const remaining = roundMoney(roundMoney(cur.amount) - roundMoney(cur.paidAmount));
        if (cur.settled || remaining <= 0) {
          throw new HttpError(400, 'Catatan hutang/piutang ini sudah lunas.');
        }
        const payAmount = hasExplicitAmount ? explicitAmount : remaining;
        const nextPaid = roundMoney(roundMoney(cur.paidAmount) + payAmount);
        const nextSettled = nextPaid >= roundMoney(cur.amount);

        await client.query(
          'UPDATE debt_loans SET paid_amount = $1, settled = $2 WHERE id = $3 AND couple_id = $4',
          [nextPaid, nextSettled, debtId, coupleId]
        );
        const joined = await client.query(`${DEBT_SELECT_SQL} WHERE d.id = $1 AND d.couple_id = $2`, [
          debtId,
          coupleId,
        ]);
        return mapPgDebtRow(joined.rows[0]);
      });
      return res.json(updated);
    }

    const list = mem.debtLoans.get(coupleId) || [];
    const debt = list.find((d) => d.id === debtId);
    if (!debt) throw new HttpError(404, 'Catatan hutang/piutang tidak ditemukan.');

    const remaining = roundMoney(roundMoney(debt.amount) - roundMoney(debt.paidAmount));
    if (debt.settled || remaining <= 0) {
      throw new HttpError(400, 'Catatan hutang/piutang ini sudah lunas.');
    }
    const payAmount = hasExplicitAmount ? explicitAmount : remaining;
    debt.paidAmount = roundMoney(roundMoney(debt.paidAmount) + payAmount);
    debt.settled = debt.paidAmount >= roundMoney(debt.amount);

    res.json(hydrateMemDebtLoan(debt));
  })
);

app.delete(
  '/api/debts/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const debtId = assertUuid(req.params.id, 'debtId');

    if (pool) {
      const del = await pool.query('DELETE FROM debt_loans WHERE id = $1 AND couple_id = $2 RETURNING id', [
        debtId,
        coupleId,
      ]);
      if (!del.rowCount) throw new HttpError(404, 'Catatan hutang/piutang tidak ditemukan.');
      return res.json({ ok: true, id: debtId });
    }

    const list = mem.debtLoans.get(coupleId) || [];
    const idx = list.findIndex((d) => d.id === debtId);
    if (idx < 0) throw new HttpError(404, 'Catatan hutang/piutang tidak ditemukan.');
    list.splice(idx, 1);
    res.json({ ok: true, id: debtId });
  })
);

// ============================================================================
// Quick Add Presets
// ============================================================================
app.get(
  '/api/presets',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    if (pool) {
      const r = await pool.query(`${PRESET_SELECT_SQL} WHERE q.couple_id = $1 ORDER BY q.created_at ASC`, [coupleId]);
      return res.json(r.rows);
    }
    const presets = [...(mem.quickPresets.get(coupleId) || [])]
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .map((p) => hydrateMemQuickPreset(p, coupleId));
    res.json(presets);
  })
);

app.post(
  '/api/presets',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const body = req.body || {};

    const cleanLabel = parseRequiredText(body.label, 'Label preset wajib diisi.');
    if (!['income', 'expense'].includes(body.type)) {
      throw new HttpError(400, 'Tipe preset harus income atau expense.');
    }
    const numericAmount = parseStrictNumber(body.amount, 'Nominal preset harus lebih dari 0.', { exclusiveMin: 0 });
    const rawCatId = body.categoryId !== undefined ? body.categoryId : body.category_id;
    const cleanCategoryId =
      rawCatId === undefined || rawCatId === null || rawCatId === '' ? null : assertUuid(rawCatId, 'categoryId');
    const rawAccId = body.accountId !== undefined ? body.accountId : body.account_id;
    const cleanAccountId =
      rawAccId === undefined || rawAccId === null || rawAccId === '' ? null : assertUuid(rawAccId, 'accountId');
    const cleanNote = String(body.note ?? '');
    const id = randomUUID();
    const createdAtIso = new Date().toISOString();

    if (pool) {
      const preset = await withPgTx(async (client) => {
        if (cleanCategoryId) {
          const cRes = await client.query('SELECT id FROM categories WHERE id = $1 AND couple_id = $2', [
            cleanCategoryId,
            coupleId,
          ]);
          if (!cRes.rowCount) throw new HttpError(404, 'Kategori tidak ditemukan.');
        }
        if (cleanAccountId) {
          const aRes = await client.query('SELECT id FROM accounts WHERE id = $1 AND couple_id = $2', [
            cleanAccountId,
            coupleId,
          ]);
          if (!aRes.rowCount) throw new HttpError(404, 'Akun tidak ditemukan.');
        }
        await client.query(
          `INSERT INTO quick_presets(id, couple_id, label, type, amount, category_id, account_id, note, created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [id, coupleId, cleanLabel, body.type, numericAmount, cleanCategoryId, cleanAccountId, cleanNote, createdAtIso]
        );
        const joined = await client.query(`${PRESET_SELECT_SQL} WHERE q.id = $1 AND q.couple_id = $2`, [
          id,
          coupleId,
        ]);
        return joined.rows[0];
      });
      return res.status(201).json(preset);
    }

    if (cleanCategoryId) {
      const cat = (mem.categories.get(coupleId) || []).find((c) => c.id === cleanCategoryId);
      if (!cat) throw new HttpError(404, 'Kategori tidak ditemukan.');
    }
    if (cleanAccountId) {
      const acc = (mem.accounts.get(coupleId) || []).find((a) => a.id === cleanAccountId);
      if (!acc) throw new HttpError(404, 'Akun tidak ditemukan.');
    }

    if (!mem.quickPresets.has(coupleId)) mem.quickPresets.set(coupleId, []);
    const presetObj = {
      id,
      coupleId,
      label: cleanLabel,
      type: body.type,
      amount: numericAmount,
      categoryId: cleanCategoryId,
      accountId: cleanAccountId,
      note: cleanNote,
      createdAt: createdAtIso,
      createdAtMs: Date.now(),
    };
    mem.quickPresets.get(coupleId).push(presetObj);
    res.status(201).json(hydrateMemQuickPreset(presetObj, coupleId));
  })
);

app.delete(
  '/api/presets/:id',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const presetId = assertUuid(req.params.id, 'presetId');

    if (pool) {
      const del = await pool.query('DELETE FROM quick_presets WHERE id = $1 AND couple_id = $2 RETURNING id', [
        presetId,
        coupleId,
      ]);
      if (!del.rowCount) throw new HttpError(404, 'Preset cepat tidak ditemukan.');
      return res.json({ ok: true, id: presetId });
    }

    const list = mem.quickPresets.get(coupleId) || [];
    const idx = list.findIndex((p) => p.id === presetId);
    if (idx < 0) throw new HttpError(404, 'Preset cepat tidak ditemukan.');
    list.splice(idx, 1);
    res.json({ ok: true, id: presetId });
  })
);

// ============================================================================
// Receipt Text Parser & Category Auto-Suggest
// ============================================================================
app.post(
  '/api/receipts/parse',
  authPartner,
  asyncHandler(async (req, res) => {
    const { coupleId } = req.partner;
    const rawText = req.body?.text;
    if (typeof rawText !== 'string' || !rawText.trim()) {
      throw new HttpError(400, 'Teks struk wajib diisi.');
    }

    let categories = [];
    if (pool) {
      const cRes = await pool.query(
        'SELECT id, name FROM categories WHERE couple_id = $1 ORDER BY is_default DESC, created_at ASC',
        [coupleId]
      );
      categories = cRes.rows;
    } else {
      categories = mem.categories.get(coupleId) || [];
    }

    const merchant = extractReceiptMerchant(rawText);
    const amount = parseReceiptAmount(rawText);
    const { suggestedCategoryId, suggestedCategoryName } = suggestReceiptCategory(rawText, categories);

    res.json({
      amount,
      merchant,
      suggestedCategoryId,
      suggestedCategoryName,
      suggestedType: 'expense',
    });
  })
);

// JSON 404 fallback for unknown /api routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
});

// Centralized Express 4 Error Middleware
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Format JSON tidak valid.' });
  }
  if (err?.code === '22P02') {
    return res.status(400).json({ error: 'Format ID atau parameter tidak valid.' });
  }
  if (err?.code === '23514' || err?.code === '23502' || err?.code === '22003') {
    return res.status(400).json({ error: 'Data tidak memenuhi aturan validasi.' });
  }
  if (err?.code === '23503') {
    const isDeleteRestrict = String(err.detail || '').includes('still referenced');
    return res.status(isDeleteRestrict ? 409 : 400).json({
      error: isDeleteRestrict
        ? 'Data tidak dapat dihapus karena masih digunakan.'
        : 'Referensi data (kategori/akun/pasangan) tidak valid.',
    });
  }
  if (err?.code === '23505') {
    return res.status(409).json({ error: 'Data sudah ada atau kode bentrok.' });
  }
  if (err?.code === '40P01' || err?.code === '40001') {
    return res.status(409).json({ error: 'Konflik transaksi bersamaan, silakan coba lagi.' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

export { app, initDb };

export function startServer(port = Number(process.env.PORT || 4100)) {
  return initDb().then(() => {
    return new Promise((resolve) => {
      const server = app.listen(port, () => resolve(server));
    });
  });
}

export async function closePool() {
  if (pool) {
    await pool.end();
  }
}

export async function stopServer(server) {
  if (server) {
    await new Promise((resolve) => server.close(() => resolve()));
  }
  await closePool();
}

export async function cleanupCouple(coupleId) {
  if (!coupleId) return;
  if (pool) {
    await withPgTx(async (client) => {
      await client.query('DELETE FROM recurring_rules WHERE couple_id = $1', [coupleId]);
      await client.query('DELETE FROM debt_loans WHERE couple_id = $1', [coupleId]);
      await client.query('DELETE FROM quick_presets WHERE couple_id = $1', [coupleId]);
      await client.query('DELETE FROM account_transfers WHERE couple_id = $1', [coupleId]);
      await client.query('DELETE FROM transactions WHERE couple_id = $1', [coupleId]);
      await client.query('DELETE FROM budgets WHERE couple_id = $1', [coupleId]);
      await client.query('DELETE FROM shared_notes WHERE couple_id = $1', [coupleId]);
      await client.query('DELETE FROM accounts WHERE couple_id = $1', [coupleId]);
      await client.query('DELETE FROM couples WHERE id = $1', [coupleId]);
    });
    return;
  }
  mem.recurringRules.delete(coupleId);
  mem.debtLoans.delete(coupleId);
  mem.quickPresets.delete(coupleId);
  mem.transfers.delete(coupleId);
  mem.transactions.delete(coupleId);
  mem.budgets.delete(coupleId);
  mem.notes.delete(coupleId);
  mem.accounts.delete(coupleId);
  mem.categories.delete(coupleId);
  mem.couples.delete(coupleId);
  for (const [pid, partner] of mem.partners.entries()) {
    if (partner.coupleId === coupleId) mem.partners.delete(pid);
  }
  for (const [tok, pid] of mem.tokens.entries()) {
    if (!mem.partners.has(pid)) mem.tokens.delete(tok);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then(() => {
    console.log(`DuaSaku API running on http://localhost:${process.env.PORT || 4100} (${pool ? 'postgresql' : 'memory'})`);
  });
}
