// Pure Node ESM WCAG 2.1 contrast & warm palette analyzer (zero dependencies)

export const LEGACY_COOL_HEXES = [
  '#0F172A',
  '#10B981',
  '#059669',
  '#E11D48',
  '#F8FAFC',
  '#6366F1',
  '#E2E8F0',
  '#64748B',
  '#94A3B8',
  '#34D399',
  '#FB7185',
  '#ECFDF5',
];

export const LEGACY_COOL_RGB_PATTERNS = [
  { label: 'rgb(15,23,42)', regex: /rgba?\(\s*15\s*,\s*23\s*,\s*42(?:\s*,\s*[\d.]+)?\s*\)/gi },
  { label: 'rgb(16,185,129)', regex: /rgba?\(\s*16\s*,\s*185\s*,\s*129(?:\s*,\s*[\d.]+)?\s*\)/gi },
  { label: 'rgb(5,150,105)', regex: /rgba?\(\s*5\s*,\s*150\s*,\s*105(?:\s*,\s*[\d.]+)?\s*\)/gi },
  { label: 'rgb(225,29,72)', regex: /rgba?\(\s*225\s*,\s*29\s*,\s*72(?:\s*,\s*[\d.]+)?\s*\)/gi },
  { label: 'rgb(248,250,252)', regex: /rgba?\(\s*248\s*,\s*250\s*,\s*252(?:\s*,\s*[\d.]+)?\s*\)/gi },
  { label: 'rgb(99,102,241)', regex: /rgba?\(\s*99\s*,\s*102\s*,\s*241(?:\s*,\s*[\d.]+)?\s*\)/gi },
  { label: 'rgb(226,232,240)', regex: /rgba?\(\s*226\s*,\s*232\s*,\s*240(?:\s*,\s*[\d.]+)?\s*\)/gi },
  { label: 'rgb(100,116,139)', regex: /rgba?\(\s*100\s*,\s*116\s*,\s*139(?:\s*,\s*[\d.]+)?\s*\)/gi },
  { label: 'rgb(148,163,184)', regex: /rgba?\(\s*148\s*,\s*163\s*,\s*184(?:\s*,\s*[\d.]+)?\s*\)/gi },
  { label: 'rgb(52,211,153)', regex: /rgba?\(\s*52\s*,\s*211\s*,\s*153(?:\s*,\s*[\d.]+)?\s*\)/gi },
  { label: 'rgb(251,113,133)', regex: /rgba?\(\s*251\s*,\s*113\s*,\s*133(?:\s*,\s*[\d.]+)?\s*\)/gi },
  { label: 'rgb(236,253,245)', regex: /rgba?\(\s*236\s*,\s*253\s*,\s*245(?:\s*,\s*[\d.]+)?\s*\)/gi },
];

export const EXPECTED_WARM_HEXES = {
  cream: '#FAF6F0',
  white: '#FFFFFF',
  warmSand: '#F2EAE0',
  border: '#E4D7C5',
  espresso: '#2C211B',
  taupe: '#6B5B51',
  mutedClay: '#9A897E',
  terracotta: '#C86446',
  terracottaDark: '#A44A30',
  terracottaSoft: '#FCEEE9',
  sage: '#5B8260',
  sageDark: '#426346',
  sageSoft: '#EBF3EC',
  ochre: '#D08E35',
  ochreSoft: '#FDF4E4',
  heroCocoa: '#3B2E28',
  heroIncome: '#9AD1A0',
  heroExpense: '#F4A58E',
};

export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const hex3 = s.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const [r, g, b] = hex3[1].split('').map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }

  const hex6 = s.match(/^#([0-9a-f]{6})$/i);
  if (hex6) {
    const n = parseInt(hex6[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }

  const hex8 = s.match(/^#([0-9a-f]{8})$/i);
  if (hex8) {
    const n = parseInt(hex8[1], 16);
    return {
      r: (n >>> 24) & 255,
      g: (n >>> 16) & 255,
      b: (n >>> 8) & 255,
      a: (n & 255) / 255,
    };
  }

  const rgbMatch = s.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i
  );
  if (rgbMatch) {
    return {
      r: Math.min(255, Math.max(0, Number(rgbMatch[1]))),
      g: Math.min(255, Math.max(0, Number(rgbMatch[2]))),
      b: Math.min(255, Math.max(0, Number(rgbMatch[3]))),
      a: rgbMatch[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgbMatch[4]))),
    };
  }
  return null;
}

export function compositeOver(fg, bg) {
  const f = typeof fg === 'string' ? parseColor(fg) : fg;
  const b = typeof bg === 'string' ? parseColor(bg) : bg;
  if (!f || !b) return null;
  const a = f.a ?? 1;
  return {
    r: Math.round(f.r * a + b.r * (1 - a)),
    g: Math.round(f.g * a + b.g * (1 - a)),
    b: Math.round(f.b * a + b.b * (1 - a)),
    a: 1,
  };
}

export function relativeLuminance(color) {
  const rgb = typeof color === 'string' ? parseColor(color) : color;
  if (!rgb) throw new Error(`Invalid color: ${String(color)}`);
  const lin = [rgb.r, rgb.g, rgb.b].map((v) => {
    const srgb = v / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(fg, bg) {
  const c1 = typeof fg === 'string' ? parseColor(fg) : fg;
  const c2 = typeof bg === 'string' ? parseColor(bg) : bg;
  if (!c1 || !c2) throw new Error(`Invalid color pair: ${String(fg)} on ${String(bg)}`);
  const effectiveFg = (c1.a ?? 1) < 1 ? compositeOver(c1, c2) : c1;
  const l1 = relativeLuminance(effectiveFg);
  const l2 = relativeLuminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function rgbToHsl(color) {
  const rgb = typeof color === 'string' ? parseColor(color) : color;
  if (!rgb) throw new Error(`Invalid color: ${String(color)}`);
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

export function isValidHex6or8(val) {
  return typeof val === 'string' && /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(val.trim());
}

export function isWarmEarthTone(hex) {
  if (!isValidHex6or8(hex)) return false;
  const upper = hex.trim().toUpperCase();
  if (LEGACY_COOL_HEXES.includes(upper.slice(0, 7))) return false;
  const rgb = parseColor(upper);
  if (!rgb) return false;
  const { s } = rgbToHsl(rgb);
  // Warm earth tones have R >= B (cream, terracotta, espresso, sand, ochre)
  // OR muted sage green (G > R with bounded green excess and moderate saturation).
  if (rgb.r >= rgb.b) return true;
  if (rgb.g > rgb.r && rgb.g - rgb.r < 45 && s < 0.55) return true;
  return false;
}

export function scanLegacyColors(text, { includeRgb = true } = {}) {
  const matches = [];
  let total = 0;
  for (const hex of LEGACY_COOL_HEXES) {
    const re = new RegExp(hex, 'gi');
    const found = text.match(re);
    if (found && found.length > 0) {
      matches.push({ token: hex, count: found.length });
      total += found.length;
    }
  }
  if (includeRgb) {
    for (const pat of LEGACY_COOL_RGB_PATTERNS) {
      const found = text.match(pat.regex);
      if (found && found.length > 0) {
        matches.push({ token: pat.label, count: found.length });
        total += found.length;
      }
    }
  }
  return { total, matches };
}

/**
 * Resolve color dictionary regardless of whether tokens.ts exports `colors`, `COLORS`, `palette`, or flat keys.
 */
export function extractTokenColors(tokensModule) {
  const root =
    tokensModule?.colors ||
    tokensModule?.COLORS ||
    tokensModule?.palette ||
    tokensModule?.theme?.colors ||
    tokensModule?.default?.colors ||
    tokensModule?.default ||
    tokensModule ||
    {};

  const flat = {};
  for (const [k, v] of Object.entries(root)) {
    if (typeof v === 'string' && v.startsWith('#')) {
      flat[k] = v;
    } else if (v && typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v)) {
        if (typeof v2 === 'string' && v2.startsWith('#')) {
          flat[`${k}.${k2}`] = v2;
        }
      }
    }
  }
  return flat;
}

export function evaluatePaletteContracts(tokensModule) {
  const flat = extractTokenColors(tokensModule);
  const values = Object.values(flat);
  const byHex = new Set(values.map((v) => v.toUpperCase()));

  const findByPred = (pred) => values.find((hex) => {
    const rgb = parseColor(hex);
    return rgb ? pred(rgb, relativeLuminance(rgb), rgbToHsl(rgb), hex.toUpperCase()) : false;
  });

  const cream =
    flat.bg ||
    flat.background ||
    flat.cream ||
    findByPred((c) => c.r >= 240 && c.g >= 235 && c.b >= 225 && c.r >= c.b && !(c.r === 255 && c.g === 255 && c.b === 255));
  const surface = flat.surface || flat.card || '#FFFFFF';
  const sand = flat.surfaceAlt || flat.sand || flat.warmSand || findByPred((c) => c.r >= 235 && c.g >= 225 && c.b >= 210 && c.r > c.b && c.r < 248);
  const espresso = flat.text || flat.espresso || flat.textPrimary || findByPred((c, l) => l < 0.05 && c.r >= c.b);
  const taupe = flat.textSecondary || flat.taupe || findByPred((c, l) => l >= 0.08 && l <= 0.16 && c.r > c.b);
  const heroBg = flat.heroBg || flat.heroCocoa || flat.cocoa || findByPred((c, l) => l >= 0.02 && l < 0.08 && c.r > c.b);
  const heroText = flat.heroText || flat.textOnHero || flat.textOnDark || flat.onHero;
  const heroIncome = flat.heroIncome || findByPred((c) => c.g >= 195 && c.r >= 135 && c.g > c.r && c.g > c.b);
  const heroExpense = flat.heroExpense || findByPred((c) => c.r >= 230 && c.g >= 145 && c.b >= 120 && c.r > c.g);
  const terracotta = flat.primary || flat.terracotta || flat.expense || findByPred((c) => c.r >= 180 && c.g >= 80 && c.g < 130 && c.r > c.g && c.g > c.b);
  const terracottaDark = flat.primaryDark || flat.terracottaDark || findByPred((c) => c.r >= 140 && c.r < 185 && c.g >= 60 && c.r > c.g && c.g >= c.b);
  const terracottaSoft = flat.primarySoft || flat.terracottaSoft || findByPred((c) => c.r >= 245 && c.g >= 225 && c.g < 245 && c.r > c.g);
  const sage = flat.sage || flat.income || flat.positive || findByPred((c, _l, hsl) => c.g > c.r && c.g >= c.b && c.g >= 115 && c.g <= 155 && hsl.s < 0.35);
  const sageDark = flat.sageDark || flat.incomeDark || findByPred((c) => c.g > c.r && c.g < 115 && c.r >= 50);
  const sageSoft = flat.sageSoft || flat.incomeSoft || findByPred((c) => c.g > c.r && c.r >= 225 && c.g >= 235);
  const ochre = flat.warning || flat.ochre || findByPred((c) => c.r >= 195 && c.g >= 125 && c.b <= 80 && c.r > c.g && c.g > c.b);
  const ochreSoft = flat.warningSoft || flat.ochreSoft || findByPred((c) => c.r >= 245 && c.g >= 235 && c.b >= 215 && c.b < 240);

  const pairs = [];
  const check = (name, fg, bg, minRatio) => {
    if (!fg || !bg) {
      pairs.push({ name, fg, bg, ratio: null, minRatio, pass: false, reason: 'missing token' });
      return;
    }
    const ratio = contrastRatio(fg, bg);
    pairs.push({ name, fg, bg, ratio: Number(ratio.toFixed(2)), minRatio, pass: ratio >= minRatio });
  };

  check('espresso on cream', espresso, cream, 4.5);
  check('espresso on surface', espresso, surface, 4.5);
  check('espresso on sand', espresso, sand, 4.5);
  check('taupe on cream', taupe, cream, 4.5);
  check('taupe on surface', taupe, surface, 4.5);
  check('taupe on sand', taupe, sand, 4.5);
  check('heroText on heroBg', heroText, heroBg, 4.5);
  check('heroIncome on heroBg', heroIncome, heroBg, 4.5);
  check('heroExpense on heroBg', heroExpense, heroBg, 4.5);
  check('terracottaDark on terracottaSoft', terracottaDark, terracottaSoft, 4.5);
  check('white on terracottaDark', '#FFFFFF', terracottaDark, 4.5);
  check('sageDark on sageSoft', sageDark, sageSoft, 4.5);
  check('white on sageDark', '#FFFFFF', sageDark, 4.5);
  check('terracotta accent on surface (UI >=3.0)', terracotta, surface, 3.0);
  check('sage accent on surface (UI >=3.0)', sage, surface, 3.0);
  if (ochre && ochreSoft) {
    // Ochre on ochreSoft is 2.53:1 so it must NEVER be used as foreground text; verify espresso on ochreSoft passes >= 4.5
    check('espresso on ochreSoft', espresso, ochreSoft, 4.5);
  }

  return {
    flat,
    byHex,
    resolved: {
      cream,
      surface,
      sand,
      espresso,
      taupe,
      heroBg,
      heroText,
      heroIncome,
      heroExpense,
      terracotta,
      terracottaDark,
      terracottaSoft,
      sage,
      sageDark,
      sageSoft,
      ochre,
      ochreSoft,
    },
    pairs,
    allPass: pairs.every((p) => p.pass),
  };
}
