/**
 * Lightweight offline Indonesian receipt parser.
 * Extracts payable amount, merchant name, suggested category ID, and a concise note.
 */

export interface ReceiptCategoryCandidate {
  id: string;
  name: string;
  type?: string;
}

export interface ParsedReceiptResult {
  amount: number | null;
  merchant: string;
  suggestedCategoryId: string | null;
  note: string;
}

interface CategoryDomainRule {
  receiptKeywords: ReadonlyArray<string>;
  categoryKeywords: ReadonlyArray<{ keyword: string; weight: number }>;
}

const DOMAIN_RULES: ReadonlyArray<CategoryDomainRule> = [
  {
    receiptKeywords: [
      'kopi',
      'coffee',
      'cafe',
      'kafe',
      'starbucks',
      'kenangan',
      'janji jiwa',
      'fore',
      'tuku',
      'resto',
      'restoran',
      'restaurant',
      'warung',
      'rumah makan',
      'padang',
      'bakso',
      'mie',
      'ayam',
      'sate',
      'nasi',
      'sushi',
      'ramen',
      'kfc',
      'mcd',
      'mcdonald',
      'burger',
      'pizza',
      'hokben',
      'solaria',
      'bakery',
      'roti',
      'bread',
      'chatime',
      'boba',
      'teh',
      'minuman',
      'makan',
      'makanan',
      'kuliner',
      'gofood',
      'grabfood',
      'shopeefood',
      'service charge',
      'pb1',
    ],
    categoryKeywords: [
      { keyword: 'makan', weight: 10 },
      { keyword: 'minum', weight: 10 },
      { keyword: 'kuliner', weight: 10 },
      { keyword: 'food', weight: 10 },
      { keyword: 'dining', weight: 9 },
      { keyword: 'jajan', weight: 9 },
      { keyword: 'kopi', weight: 9 },
      { keyword: 'konsumsi', weight: 8 },
      { keyword: 'rumah tangga', weight: 4 },
    ],
  },
  {
    receiptKeywords: [
      'indomaret',
      'alfamart',
      'alfamidi',
      'superindo',
      'hypermart',
      'transmart',
      'lottemart',
      'ranch market',
      'farmers market',
      'grand lucky',
      'hero',
      'swalayan',
      'minimarket',
      'supermarket',
      'mart',
      'pasar',
      'beras',
      'minyak goreng',
      'gula',
      'susu',
      'sabun',
      'detergen',
      'shampoo',
      'tissue',
      'tisu',
      'popok',
      'galon',
      'aqua',
      'lpg',
      'ikea',
      'ace hardware',
      'mr diy',
      'belanja',
    ],
    categoryKeywords: [
      { keyword: 'rumah tangga', weight: 10 },
      { keyword: 'belanja', weight: 10 },
      { keyword: 'grocer', weight: 10 },
      { keyword: 'kebutuhan', weight: 9 },
      { keyword: 'dapur', weight: 8 },
      { keyword: 'harian', weight: 7 },
      { keyword: 'bulanan', weight: 7 },
      { keyword: 'shopping', weight: 7 },
    ],
  },
  {
    receiptKeywords: [
      'pertamina',
      'pertamax',
      'pertalite',
      'shell',
      'spbu',
      'bensin',
      'bbm',
      'gojek',
      'goride',
      'gocar',
      'grab',
      'grabcar',
      'grabbike',
      'maxim',
      'bluebird',
      'taksi',
      'taxi',
      'e-toll',
      'tol',
      'parkir',
      'parking',
      'secure parking',
      'kereta',
      'kai',
      'mrt',
      'lrt',
      'transjakarta',
      'commuter',
      'ojek',
      'bengkel',
      'servis',
      'oli',
    ],
    categoryKeywords: [
      { keyword: 'transport', weight: 10 },
      { keyword: 'kendaraan', weight: 10 },
      { keyword: 'bensin', weight: 9 },
      { keyword: 'bbm', weight: 9 },
      { keyword: 'parkir', weight: 8 },
      { keyword: 'ojek', weight: 8 },
      { keyword: 'traveling', weight: 6 },
      { keyword: 'jalan', weight: 5 },
    ],
  },
  {
    receiptKeywords: [
      'hotel',
      'villa',
      'resort',
      'airbnb',
      'reddoorz',
      'oyo',
      'pesawat',
      'garuda',
      'citilink',
      'lion air',
      'airasia',
      'batik air',
      'traveloka',
      'tiket.com',
      'agoda',
      'boarding pass',
      'bandara',
      'airport',
      'wisata',
      'liburan',
      'penginapan',
      'tour',
    ],
    categoryKeywords: [
      { keyword: 'traveling', weight: 10 },
      { keyword: 'travel', weight: 10 },
      { keyword: 'jalan', weight: 9 },
      { keyword: 'liburan', weight: 9 },
      { keyword: 'wisata', weight: 9 },
      { keyword: 'akomodasi', weight: 8 },
      { keyword: 'hotel', weight: 8 },
    ],
  },
  {
    receiptKeywords: [
      'bridal',
      'wedding',
      'nikah',
      'menikah',
      'catering',
      'dekorasi',
      'mua',
      'kebaya',
      'cincin',
      'mahar',
      'seserahan',
      'gedung',
      'undangan',
      'souvenir',
      'prewedding',
    ],
    categoryKeywords: [
      { keyword: 'menikah', weight: 11 },
      { keyword: 'wedding', weight: 11 },
      { keyword: 'nikah', weight: 10 },
      { keyword: 'pernikahan', weight: 10 },
    ],
  },
  {
    receiptKeywords: [
      'apotek',
      'apotik',
      'kimia farma',
      'k-24',
      'k24',
      'century',
      'guardian',
      'watsons',
      'klinik',
      'rumah sakit',
      'hospital',
      'dokter',
      'obat',
      'vitamin',
      'halodoc',
      'alodokter',
      'prodia',
      'dental',
    ],
    categoryKeywords: [
      { keyword: 'kesehatan', weight: 10 },
      { keyword: 'health', weight: 10 },
      { keyword: 'obat', weight: 9 },
      { keyword: 'medis', weight: 9 },
      { keyword: 'dokter', weight: 8 },
      { keyword: 'rumah tangga', weight: 4 },
    ],
  },
  {
    receiptKeywords: [
      'pln',
      'token listrik',
      'tagihan listrik',
      'listrik',
      'pdam',
      'telkom',
      'indihome',
      'biznet',
      'myrepublic',
      'wifi',
      'telkomsel',
      'indosat',
      'smartfren',
      'pulsa',
      'paket data',
      'kuota',
      'bpjs',
      'iuran',
      'ipl',
      'asuransi',
    ],
    categoryKeywords: [
      { keyword: 'tagihan', weight: 10 },
      { keyword: 'utilitas', weight: 10 },
      { keyword: 'listrik', weight: 9 },
      { keyword: 'internet', weight: 9 },
      { keyword: 'pulsa', weight: 9 },
      { keyword: 'bill', weight: 8 },
      { keyword: 'rumah tangga', weight: 5 },
    ],
  },
  {
    receiptKeywords: [
      'bioskop',
      'cinema',
      'xxi',
      'cgv',
      'cinepolis',
      'nonton',
      'netflix',
      'spotify',
      'youtube',
      'steam',
      'playstation',
      'karaoke',
      'timezone',
      'funworld',
      'konser',
    ],
    categoryKeywords: [
      { keyword: 'hiburan', weight: 10 },
      { keyword: 'entertainment', weight: 10 },
      { keyword: 'nonton', weight: 9 },
      { keyword: 'rekreasi', weight: 8 },
      { keyword: 'hobi', weight: 8 },
      { keyword: 'traveling', weight: 4 },
    ],
  },
  {
    receiptKeywords: [
      'bibit',
      'bareksa',
      'ajaib',
      'stockbit',
      'pluang',
      'reksadana',
      'saham',
      'antam',
      'pegadaian',
      'deposito',
      'emas',
      'investasi',
    ],
    categoryKeywords: [
      { keyword: 'investasi', weight: 11 },
      { keyword: 'tabungan', weight: 8 },
      { keyword: 'emas', weight: 8 },
      { keyword: 'saving', weight: 7 },
    ],
  },
];

const STOP_WORDS = new Set([
  'dan',
  'atau',
  'untuk',
  'yang',
  'bersama',
  'lainnya',
  'lain',
  'biaya',
  'pos',
]);

const NON_TOTAL_EXCLUDE_RE =
  /\b(?:kembali|kembalian|change|uang\s*kembali|diskon|discount|potongan|hemat|voucher|poin\s*(?:member|anda|didapat|reward)|tukar\s*poin|earned\s*points?|npwp|no\.?\s*struk|invoice\s*no|order\s*id|trx\s*id|ref(?:erence)?|telp|phone|fax|total\s*(?:item|qty|barang|pcs|unit)|jumlah\s*(?:item|qty|barang|pcs|unit))\b/i;

const TENDER_LOW_PRIORITY_RE = /\b(?:tunai|cash)\b/i;

const MERCHANT_EXPLICIT_RE = /^(?:merchant|toko|outlet|store|vendor|nama\s*toko)\s*[:\-]\s*(.+)$/i;

const MERCHANT_SKIP_RE =
  /^(?:struk|receipt|nota|invoice|bukti\s*pembayaran|selamat\s*datang|terima\s*kasih|thank\s*you|jl\.?\s|jalan\s|komplek|ruko|lt\.?\s*\d|lantai\s|kec\.?\s|kab\.?\s|kode\s*pos|telp|phone|hp\s*[:.]|wa\s*[:.]|fax|npwp|ig\s*:|www\.|https?:\/\/|no\.?\s*(?:struk|nota|order|trx|ref)|kasir|cashier|operator|meja|table|tanggal|tgl\b|date\b|waktu|jam\b)/i;

const SEPARATOR_LINE_RE = /^[\s\-=_*~.+#/\\|]+$/;

function sanitizeLineForNumbers(line: string): string {
  return (
    line
      // Dates: 25/11/2026, 2026-11-25, 25-11-26
      .replace(/\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/g, ' ')
      // Written Indonesian/English dates: 25 Nov 2026
      .replace(
        /\b\d{1,2}\s+(?:jan|feb|mar|apr|mei|may|jun|jul|agu|aug|sep|okt|oct|nov|des|dec)[a-z]*\s+\d{2,4}\b/gi,
        ' '
      )
      // Times: 14:22 or 14:22:05
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
      // Percentages: 11%, 5.5%
      .replace(/\b\d+(?:[.,]\d+)?\s*%/g, ' ')
      // Phone / dashed codes / NPWP
      .replace(/\b\d+(?:-\d+)+\b/g, ' ')
      .replace(/\b(?:\+?62|0)\d{8,13}\b/g, ' ')
  );
}

function parseMoneyToken(rawNum: string, hasCurrencyPrefix: boolean): number | null {
  const cleaned = rawNum.replace(/\s+/g, '').replace(/(?:,-|\/-|\.-)$/, '');
  if (!cleaned) return null;

  let value: number | null = null;

  if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(cleaned)) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    value = Math.round(Number(normalized));
  } else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(cleaned)) {
    const normalized = cleaned.replace(/,/g, '');
    value = Math.round(Number(normalized));
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    value = Number(cleaned.replace(/\./g, ''));
  } else if (/^\d{1,3}(?:,\d{3})+$/.test(cleaned)) {
    value = Number(cleaned.replace(/,/g, ''));
  } else if (/^\d+[.,]\d{1,2}$/.test(cleaned)) {
    value = Math.round(Number(cleaned.replace(',', '.')));
  } else if (/^\d+$/.test(cleaned)) {
    value = Number(cleaned);
  }

  if (value === null || !Number.isFinite(value) || value <= 0 || value > 500_000_000) {
    return null;
  }

  if (!hasCurrencyPrefix && value < 100) {
    return null;
  }

  return Math.trunc(value);
}

function extractAmountsFromLine(line: string): Array<{ value: number; hasPrefix: boolean }> {
  const cleanedLine = sanitizeLineForNumbers(line);
  const results: Array<{ value: number; hasPrefix: boolean }> = [];
  const tokenRe =
    /(^|[\s:(])(-)?((?:rp\.?|idr)\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(?:,-|\/-|\.-))?(?=$|[\s).,;])/gi;

  let match: RegExpExecArray | null = tokenRe.exec(cleanedLine);
  while (match !== null) {
    const isNegative = Boolean(match[2]);
    const hasPrefix = Boolean(match[3]);
    const rawNum = match[4];

    if (!isNegative && rawNum) {
      const parsed = parseMoneyToken(rawNum, hasPrefix);
      if (parsed !== null) {
        results.push({ value: parsed, hasPrefix });
      }
    }
    match = tokenRe.exec(cleanedLine);
  }

  return results;
}

function scoreAmountLine(line: string): number {
  if (NON_TOTAL_EXCLUDE_RE.test(line)) return -1;

  if (
    /\b(?:grand\s*total|total\s*(?:bayar|tagihan|belanja|harga|pembayaran|nett?)|net\s*total|jumlah\s*(?:bayar|tagihan|pembayaran)|yang\s*harus\s*dibayar)\b/i.test(
      line
    )
  ) {
    return 100;
  }
  if (/\bsub\s*-?\s*total\b/i.test(line)) {
    return 40;
  }
  if (/\btotal\b/i.test(line)) {
    return 85;
  }
  if (/\b(?:jumlah|tagihan|nominal|amount\s*due)\b/i.test(line)) {
    return 75;
  }
  if (/\b(?:bayar|dibayar|pembayaran|qris|debit|kredit|gopay|ovo|dana|shopeepay|transfer)\b/i.test(line)) {
    return 60;
  }
  if (TENDER_LOW_PRIORITY_RE.test(line)) {
    return 15;
  }
  if (/\b(?:rp\.?|idr)\b/i.test(line)) {
    return 25;
  }
  return 10;
}

function extractReceiptAmount(lines: ReadonlyArray<string>): number | null {
  let bestScore = -1;
  let bestLineIdx = -1;
  let bestValue: number | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const baseScore = scoreAmountLine(line);
    if (baseScore < 0) continue;

    const amounts = extractAmountsFromLine(line);
    if (amounts.length > 0) {
      // Rightmost money token on a receipt line is the line amount (left tokens are often qty/weights)
      const chosen = amounts[amounts.length - 1];
      const effectiveScore = baseScore + (chosen.hasPrefix ? 2 : 0);
      if (
        effectiveScore > bestScore ||
        (effectiveScore === bestScore &&
          (i > bestLineIdx || (bestValue !== null && baseScore < 40 && chosen.value > bestValue)))
      ) {
        bestScore = effectiveScore;
        bestLineIdx = i;
        bestValue = chosen.value;
      }
      continue;
    }

    // Handle OCR line wraps where "GRAND TOTAL" is followed by "Rp 45.000" on the next line
    if (baseScore >= 60 && i + 1 < lines.length && !NON_TOTAL_EXCLUDE_RE.test(lines[i + 1])) {
      const nextAmounts = extractAmountsFromLine(lines[i + 1]);
      if (nextAmounts.length > 0 && scoreAmountLine(lines[i + 1]) < baseScore) {
        const chosen = nextAmounts[nextAmounts.length - 1];
        const wrappedScore = baseScore - 1;
        if (wrappedScore > bestScore || (wrappedScore === bestScore && i + 1 > bestLineIdx)) {
          bestScore = wrappedScore;
          bestLineIdx = i + 1;
          bestValue = chosen.value;
        }
      }
    }
  }

  return bestValue;
}

function cleanMerchantText(raw: string): string {
  return raw
    .replace(/^[*#\-=_.\s]+|[*#\-=_.\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}

function isPoorMerchantCandidate(line: string): boolean {
  if (SEPARATOR_LINE_RE.test(line)) return true;
  if (MERCHANT_SKIP_RE.test(line)) return true;
  if (NON_TOTAL_EXCLUDE_RE.test(line)) return true;
  if (/\b(?:grand\s*total|sub\s*-?\s*total|total|jumlah|bayar|tunai|cash|ppn|pajak)\b/i.test(line)) {
    return true;
  }
  if (/^(?:rp\.?|idr)\s*\d/i.test(line)) return true;
  // Reject item/price lines ending with currency or formatted prices (e.g. "KOPI SUSU 18.000")
  if (/\s+(?:(?:rp\.?|idr)\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?(?:\s*(?:,-|\/-|\.-))?$/i.test(line)) {
    return true;
  }
  if (/\s+(?:rp\.?|idr)\s*\d+/i.test(line)) return true;

  const letters = (line.match(/[a-zA-Z]/g) || []).length;
  const digits = (line.match(/\d/g) || []).length;
  if (letters < 2) return true;
  if (digits > letters * 1.5) return true;

  return false;
}

function extractMerchant(lines: ReadonlyArray<string>): string {
  for (const line of lines) {
    const explicit = MERCHANT_EXPLICIT_RE.exec(line);
    if (explicit && explicit[1]) {
      const cleaned = cleanMerchantText(explicit[1]);
      if (cleaned.length >= 2) return cleaned;
    }
  }

  const topLimit = Math.min(lines.length, 6);
  for (let i = 0; i < topLimit; i += 1) {
    const candidate = cleanMerchantText(lines[i]);
    if (candidate.length >= 2 && !isPoorMerchantCandidate(candidate)) {
      return candidate;
    }
  }

  return '';
}

function extractSampleItems(lines: ReadonlyArray<string>, merchant: string): string[] {
  const items: string[] = [];
  const lowerMerchant = merchant.toLowerCase();

  for (const line of lines) {
    if (items.length >= 2) break;
    if (SEPARATOR_LINE_RE.test(line) || MERCHANT_SKIP_RE.test(line)) continue;
    if (NON_TOTAL_EXCLUDE_RE.test(line)) continue;
    if (scoreAmountLine(line) >= 40 || TENDER_LOW_PRIORITY_RE.test(line)) continue;

    const amounts = extractAmountsFromLine(line);
    if (amounts.length === 0) continue;

    const withoutAmounts = sanitizeLineForNumbers(line)
      .replace(/(?:rp\.?|idr)\s*[\d.,]+(?:\s*(?:,-|\/-|\.-))?/gi, '')
      .replace(/\b\d{1,3}(?:[.,]\d{3})+\b/g, '')
      .replace(/^\s*\d+\s*[x×]\s*/i, '')
      .replace(/[\d.,]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (
      withoutAmounts.length >= 3 &&
      /[a-zA-Z]{2,}/.test(withoutAmounts) &&
      withoutAmounts.toLowerCase() !== lowerMerchant &&
      !/^(?:ppn|pb1|tax|pajak|service|admin|ongkir)\b/i.test(withoutAmounts)
    ) {
      items.push(withoutAmounts.slice(0, 32));
    }
  }

  return items;
}

function suggestCategoryId(
  fullText: string,
  categories: ReadonlyArray<ReceiptCategoryCandidate>
): string | null {
  if (!categories || categories.length === 0) return null;

  const lowerText = fullText.toLowerCase();
  const expenseLike = categories.filter((c) => c.type?.toLowerCase() !== 'income');
  const pool = expenseLike.length > 0 ? expenseLike : categories;

  const scores = new Map<string, number>();
  for (const cat of pool) {
    scores.set(cat.id, 0);
  }

  // 1. Direct token overlap with category names
  for (const cat of pool) {
    const words = cat.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
    for (const word of words) {
      if (lowerText.includes(word)) {
        scores.set(cat.id, (scores.get(cat.id) ?? 0) + 12);
      }
    }
  }

  // 2. Semantic Indonesian receipt keyword matching
  for (const rule of DOMAIN_RULES) {
    let receiptHits = 0;
    for (const kw of rule.receiptKeywords) {
      if (lowerText.includes(kw)) {
        receiptHits += 1;
      }
    }
    if (receiptHits === 0) continue;

    for (const cat of pool) {
      const catLower = cat.name.toLowerCase();
      let bestRuleWeight = 0;
      for (const ck of rule.categoryKeywords) {
        if (catLower.includes(ck.keyword)) {
          bestRuleWeight = Math.max(bestRuleWeight, ck.weight);
        }
      }
      if (bestRuleWeight > 0) {
        const boost = bestRuleWeight * Math.min(receiptHits, 4);
        scores.set(cat.id, (scores.get(cat.id) ?? 0) + boost);
      }
    }
  }

  let bestId: string | null = null;
  let bestScore = 0;
  for (const cat of pool) {
    const score = scores.get(cat.id) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestId = cat.id;
    }
  }

  return bestScore > 0 ? bestId : null;
}

/**
 * Parses raw Indonesian receipt text into structured transaction defaults.
 */
export function parseReceiptLocally(
  text: string,
  categories: ReadonlyArray<ReceiptCategoryCandidate> = []
): ParsedReceiptResult {
  if (typeof text !== 'string' || !text.trim()) {
    return {
      amount: null,
      merchant: '',
      suggestedCategoryId: null,
      note: '',
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      amount: null,
      merchant: '',
      suggestedCategoryId: null,
      note: '',
    };
  }

  const amount = extractReceiptAmount(lines);
  const merchant = extractMerchant(lines);
  const suggestedCategoryId = suggestCategoryId(text, categories);
  const items = extractSampleItems(lines, merchant);

  let note = '';
  if (merchant && items.length > 0) {
    note = `${merchant} · ${items.join(', ')}`.slice(0, 100);
  } else if (merchant) {
    note = merchant;
  } else if (items.length > 0) {
    note = items.join(', ').slice(0, 100);
  } else if (amount !== null) {
    note = 'Belanja dari struk';
  }

  return {
    amount,
    merchant,
    suggestedCategoryId,
    note,
  };
}
