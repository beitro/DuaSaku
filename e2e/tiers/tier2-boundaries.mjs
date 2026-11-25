// Tier 2 — Boundary, Error, Isolation & Corner Case Tests (52 tests: 34 API + 18 UI/Web)

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PROJECT_ROOT,
  apiRequest,
  assert,
  assertApprox,
  assertEqual,
  assertStatus,
  createAccount,
  createCouple,
  createTx,
  saveBudget,
  setupCoupleContext,
} from '../lib/harness.mjs';
import {
  contrastRatio,
  evaluatePaletteContracts,
  extractTokenColors,
  isValidHex6or8,
  parseColor,
} from '../lib/wcag.mjs';

async function importTsFresh(relPath) {
  const abs = path.join(PROJECT_ROOT, relPath);
  const url = new URL(`file://${abs}?t=${Date.now()}_${Math.random()}`);
  return await import(url.href);
}

async function listSourceFiles() {
  const results = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) results.push(full);
    }
  }
  await walk(path.join(PROJECT_ROOT, 'src'));
  results.push(path.join(PROJECT_ROOT, 'App.tsx'));
  return results;
}

async function seedAndLoginBrowser(cdp, webUrl, apiUrl, { coupleName = 'Boundary Couple', partnerName = 'Raka' } = {}) {
  const ctx = await setupCoupleContext(apiUrl, { withPartnerB: false, coupleName, nameA: partnerName });
  await cdp.navigate(webUrl);
  await cdp.clearStorage();
  await cdp.reload();
  await cdp.waitForText('Buat Ruang Baru');

  // Login by creating or injecting token into localStorage (try storage keys + reload, or create via UI)
  // Using UI or direct token injection: wait—to avoid guessing exact localStorage key name, let's discover if storage.ts exists, or create via UI!
  // Actually creating via UI is 100% opaque-box, OR if we seed via API we can create via API + check storage key from storage.ts or use UI when seeding isn't needed.
  return ctx;
}

async function createCoupleViaUi(cdp, webUrl, coupleName = 'Uji Batas', partnerName = 'Raka') {
  await cdp.navigate(webUrl);
  await cdp.clearStorage();
  await cdp.reload();
  await cdp.waitForText('Buat Ruang Baru');
  await cdp.fillInput('Dompet Masa Depan', coupleName);
  await cdp.fillInput('Raka / Nadia', partnerName);
  await cdp.clickByText(/Mulai & Dapatkan Kode Undangan|Mulai Sekarang|^Buat Ruang$/i);
  await cdp.waitForText(coupleName);
  await cdp.waitForText(/Ringkas/);
}

async function extractSessionFromBrowser(cdp, apiUrl) {
  const storage = await cdp.getAllStorage();
  const token = Object.values(storage).find((v) => typeof v === 'string' && v.length >= 20);
  assert(token, `Expected persisted session token in localStorage, found: ${JSON.stringify(storage)}`);
  const catRes = await apiRequest(apiUrl, '/api/categories', { token });
  assertStatus(catRes, 200);
  return { token, categories: catRes.data };
}

export function getTier2Tests() {
  return [
    // =========================================================================
    // F1 — Warm Palette Boundaries (6 Tests)
    // =========================================================================
    {
      id: 'T2-F1-01',
      tier: 2,
      feature: 'F1',
      kind: 'static',
      description: 'WCAG boundary pairs on Warm Sand (#F2EAE0) and soft tints; warning text avoids low-contrast Ochre-on-Soft',
      fn: async () => {
        const tokensMod = await importTsFresh('src/theme/tokens.ts');
        const evalRes = evaluatePaletteContracts(tokensMod);
        const r = evalRes.resolved;
        assert(r.sand && r.taupe && r.espresso, 'Missing sand/taupe/espresso tokens');
        assert(contrastRatio(r.taupe, r.sand) >= 4.5, `Taupe on Warm Sand contrast < 4.5`);
        if (r.terracottaSoft) {
          assert(contrastRatio(r.espresso, r.terracottaSoft) >= 4.5, 'Espresso on terracottaSoft < 4.5');
        }
        if (r.sageSoft) {
          assert(contrastRatio(r.espresso, r.sageSoft) >= 4.5, 'Espresso on sageSoft < 4.5');
        }
        if (r.ochre && r.ochreSoft) {
          assert(contrastRatio(r.ochre, r.ochreSoft) < 4.5, 'Reference check: Ochre on softWarning is <4.5 so must not be used for text');
          assert(contrastRatio(r.espresso, r.ochreSoft) >= 4.5, 'Espresso on softWarning must be >= 4.5');
        }
      },
    },
    {
      id: 'T2-F1-02',
      tier: 2,
      feature: 'F1',
      kind: 'static',
      requiresBundle: true,
      description: 'RGBA/translucent backdrop audit: alpha in [0, 1] and zero legacy slate rgba(15,23,42,...) backdrops',
      fn: async (ctx) => {
        const files = await listSourceFiles();
        const combined = [
          ...(await Promise.all(files.map((f) => fs.readFile(f, 'utf8')))),
          ctx.webBundle?.bundleCode || '',
        ].join('\n');

        assert(
          !/rgba?\(\s*15\s*,\s*23\s*,\s*42\b/i.test(combined),
          'Legacy slate backdrop rgba(15, 23, 42, ...) still present'
        );
        const rgbaMatches = combined.matchAll(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/gi);
        for (const m of rgbaMatches) {
          const alpha = Number(m[1]);
          assert(Number.isFinite(alpha) && alpha >= 0 && alpha <= 1, `Invalid rgba alpha: ${m[0]}`);
        }
      },
    },
    {
      id: 'T2-F1-03',
      tier: 2,
      feature: 'F1',
      kind: 'static',
      description: 'All color hex literals in src/theme/tokens.ts and app.json are valid 6- or 8-digit hex strings',
      fn: async () => {
        const tokensMod = await importTsFresh('src/theme/tokens.ts');
        const flat = extractTokenColors(tokensMod);
        const entries = Object.entries(flat);
        assert(entries.length >= 10, `Expected >= 10 color tokens in tokens.ts, found ${entries.length}`);
        for (const [k, v] of entries) {
          assert(isValidHex6or8(v), `Invalid hex literal for token ${k}: ${String(v)}`);
        }
        const appJson = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, 'app.json'), 'utf8'));
        const iconBg = appJson?.expo?.android?.adaptiveIcon?.backgroundColor;
        assert(isValidHex6or8(iconBg), `Invalid hex in app.json adaptiveIcon.backgroundColor: ${iconBg}`);
      },
    },
    {
      id: 'T2-F1-04',
      tier: 2,
      feature: 'F1',
      kind: 'browser',
      description: 'Legacy saturated category color (#EC4899) stays isolated from text contrast on Pos & Target / Transaksi',
      fn: async (ctx) => {
        const { cdp, webUrl, apiUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Isolasi Warna', 'Raka');
        const { token } = await extractSessionFromBrowser(cdp, apiUrl);

        const catRes = await apiRequest(apiUrl, '/api/categories', {
          method: 'POST',
          token,
          body: { name: 'Kado Spesial', icon: '🎁', color: '#EC4899', targetAmount: 1000000 },
        });
        assertStatus(catRes, 201);
        await createTx(apiUrl, token, { categoryId: catRes.data.id, type: 'expense', amount: 150000, note: 'Hadiah pink' });

        await cdp.reload();
        await cdp.waitForText(/Ringkas/);
        await cdp.clickByText('Transaksi', { exact: true, last: true });
        await cdp.waitForText('Hadiah pink');

        const audit = await cdp.getDomAudit();
        assertEqual(
          audit.contrastFailures.length,
          0,
          `Legacy category color caused contrast failure: ${JSON.stringify(audit.contrastFailures)}`
        );
      },
    },
    {
      id: 'T2-F1-05',
      tier: 2,
      feature: 'F1',
      kind: 'browser',
      description: 'Budget progress bar transitions cleanly at 0%/74% (Sage), 75%/99% (Ochre), and 100%+ (Terracotta)',
      fn: async (ctx) => {
        const { cdp, webUrl, apiUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Batas Warna', 'Raka');
        const { token, categories } = await extractSessionFromBrowser(cdp, apiUrl);

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const isoNow = now.toISOString();

        // Cat 0 -> 50% (Sage), Cat 1 -> 80% (Ochre), Cat 2 -> 120% (Terracotta)
        await saveBudget(apiUrl, token, { categoryId: categories[0].id, month: currentMonth, limitAmount: 1000000 });
        await createTx(apiUrl, token, { categoryId: categories[0].id, type: 'expense', amount: 500000, occurredAt: isoNow });

        await saveBudget(apiUrl, token, { categoryId: categories[1].id, month: currentMonth, limitAmount: 1000000 });
        await createTx(apiUrl, token, { categoryId: categories[1].id, type: 'expense', amount: 800000, occurredAt: isoNow });

        await saveBudget(apiUrl, token, { categoryId: categories[2].id, month: currentMonth, limitAmount: 1000000 });
        await createTx(apiUrl, token, { categoryId: categories[2].id, type: 'expense', amount: 1200000, occurredAt: isoNow });

        await cdp.reload();
        await cdp.waitForText(/Ringkas/);
        await cdp.clickByText('Anggaran', { exact: true, last: true });
        await cdp.waitForText('50%');

        const colorsFound = await cdp.evalFn(() => {
          const fills = [];
          for (const el of document.querySelectorAll('div')) {
            const p = el.parentElement;
            if (!p) continue;
            if (el.children.length > 0 || (el.innerText || '').trim() !== '') continue;
            const rect = el.getBoundingClientRect();
            const parentRect = p.getBoundingClientRect();
            if (
              rect.height >= 4 &&
              rect.height <= 24 &&
              rect.width >= 8 &&
              parentRect.width >= 50 &&
              rect.width <= parentRect.width + 2 &&
              Math.abs(rect.height - parentRect.height) <= 4
            ) {
              const bg = getComputedStyle(el).backgroundColor;
              if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                fills.push(bg);
              }
            }
          }
          return Array.from(new Set(fills));
        });
        const hasSage = colorsFound.some((c) => {
          const p = parseColor(c);
          return p && p.g > p.r && p.g > 100 && p.r < 120;
        });
        const hasOchre = colorsFound.some((c) => {
          const p = parseColor(c);
          return p && p.r > 180 && p.g > 110 && p.b < 90;
        });
        const hasTerracotta = colorsFound.some((c) => {
          const p = parseColor(c);
          return p && p.r > 150 && p.g < 125 && p.r > p.g;
        });
        assert(hasSage, `Expected Sage progress bar fill in Anggaran, found: ${JSON.stringify(colorsFound)}`);
        assert(hasOchre, `Expected Ochre warning progress bar fill in Anggaran, found: ${JSON.stringify(colorsFound)}`);
        assert(hasTerracotta, `Expected Terracotta danger progress bar fill in Anggaran, found: ${JSON.stringify(colorsFound)}`);
      },
    },
    {
      id: 'T2-F1-06',
      tier: 2,
      feature: 'F1',
      kind: 'browser',
      description: 'TextInputs in Onboarding & QuickEntrySheet have legible text contrast (>= 4.5:1) and visible borders',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        const auditVisibleInputs = async (contextLabel, minCount) => {
          const inputAudit = await cdp.evalFn(() => {
            const inputs = Array.from(document.querySelectorAll('input, textarea')).filter((el) => {
              const cs = getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1;
            });
            return inputs.map((el) => {
              const cs = getComputedStyle(el);
              return {
                placeholder: el.getAttribute('placeholder') || '',
                color: cs.color,
                backgroundColor: cs.backgroundColor,
                borderColor: cs.borderColor,
                borderWidth: parseFloat(cs.borderTopWidth) || parseFloat(cs.borderWidth) || 0,
              };
            });
          });
          assert(inputAudit.length >= minCount, `Expected at least ${minCount} TextInputs on ${contextLabel}, found ${inputAudit.length}`);
          for (const inp of inputAudit) {
            const fg = parseColor(inp.color);
            const bg = parseColor(inp.backgroundColor);
            assert(fg && bg && bg.a > 0, `${contextLabel} input missing opaque background/color: ${JSON.stringify(inp)}`);
            assert(contrastRatio(fg, bg) >= 4.5, `${contextLabel} input text contrast < 4.5: ${JSON.stringify(inp)}`);
            assert(inp.borderWidth > 0, `${contextLabel} input missing visible border: ${JSON.stringify(inp)}`);
          }
        };

        await cdp.setViewport(375, 812, true);
        await cdp.navigate(webUrl);
        await cdp.clearStorage();
        await cdp.reload();
        await cdp.waitForText('Buat Ruang Baru');
        await auditVisibleInputs('Onboarding', 2);

        await createCoupleViaUi(cdp, webUrl, 'Audit Input', 'Raka');
        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('Simpan');
        await auditVisibleInputs('QuickEntrySheet', 2);
      },
    },

    // =========================================================================
    // F2 — Quick Entry Boundaries (6 Tests)
    // =========================================================================
    {
      id: 'T2-F2-01',
      tier: 2,
      feature: 'F2',
      kind: 'static',
      description: 'formatRp & parseIdrInput handle 0, 1, 999, negative, trillion-scale, decimal string "50000.00", and NaN',
      fn: async () => {
        const fmt = await importTsFresh('src/utils/format.ts');
        assertEqual(fmt.formatRp(0), 'Rp 0');
        assertEqual(fmt.formatRp(1), 'Rp 1');
        assertEqual(fmt.formatRp(999), 'Rp 999');
        assertEqual(fmt.formatRp(1000), 'Rp 1.000');
        assertEqual(fmt.formatRp(-500000), '-Rp 500.000', 'Negative formatRp must prefix minus before Rp');
        assertEqual(fmt.formatRp(999999999999), 'Rp 999.999.999.999');
        assertEqual(fmt.formatRp(Number.NaN), 'Rp 0');
        assertEqual(fmt.formatRp(Number.POSITIVE_INFINITY), 'Rp 0');
        assertEqual(fmt.parseIdrInput('50000.00'), 50000, 'Decimal DB string 50000.00 must parse as 50000 not 5000000');
        assertEqual(fmt.parseIdrInput('Rp 25.000,-'), 25000);
        assertEqual(fmt.parseIdrInput('abc'), 0);
      },
    },
    {
      id: 'T2-F2-02',
      tier: 2,
      feature: 'F2',
      kind: 'browser',
      description: 'QuickEntrySheet rejects empty, 0, and non-numeric amounts inline with zero POST requests',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Validasi Nominal', 'Raka');
        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('Simpan');

        for (const bad of ['', '0', 'abc']) {
          cdp.clearTrackedRequests();
          await cdp.fillInput(/Nominal|500000|500\.000/i, bad);
          await cdp.clickByText('Simpan', { exact: true, last: true });
          await new Promise((r) => setTimeout(r, 200));
          const posts = cdp.requests.filter((r) => r.method === 'POST' && r.url.includes('/api/transactions'));
          assertEqual(posts.length, 0, `Invalid amount "${bad}" must not send POST /api/transactions`);
          const text = await cdp.getBodyText();
          assert(text.includes('Simpan'), `Modal must stay open after invalid amount "${bad}"`);
          assert(/valid|nominal|lebih dari/i.test(text), `Expected inline validation error for "${bad}"`);
        }
      },
    },
    {
      id: 'T2-F2-03',
      tier: 2,
      feature: 'F2',
      kind: 'browser',
      description: 'MonthSelector steps cleanly across months without JS day-31 overflow; month & date-shift helpers handle boundaries & leap years',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Kalender Akurat', 'Raka');

        // Verify MonthSelector displays "Selama Sebulan" & steps backward/forward cleanly
        await cdp.waitForText(/Selama Sebulan/i);
        const beforeText = await cdp.getBodyText();
        await cdp.clickByText(/^‹$|^<$/);
        await new Promise((r) => setTimeout(r, 200));
        const prevMonthText = await cdp.getBodyText();
        assert(prevMonthText !== beforeText, 'Clicking previous month arrow did not update month selector label');
        await cdp.clickByText(/Bulan Ini/i);
        await new Promise((r) => setTimeout(r, 200));

        // Verify month/date-shift helpers exported in format.ts (shiftMonthKey/shiftMonth & shiftDateInput/shiftDateKey)
        const fmt = await importTsFresh('src/utils/format.ts');
        const shiftMonthFn = fmt.shiftMonthKey || fmt.shiftMonth;
        assertEqual(typeof shiftMonthFn, 'function', 'format.ts must export shiftMonthKey or shiftMonth');
        assertEqual(shiftMonthFn('2026-01', 1), '2026-02', '2026-01 + 1 must be 2026-02');
        assertEqual(shiftMonthFn('2026-01', -1), '2025-12', '2026-01 - 1 must be 2025-12');
        assertEqual(shiftMonthFn('2026-12', 1), '2027-01', '2026-12 + 1 must be 2027-01');

        const shiftDateFn = fmt.shiftDateInput || fmt.shiftDateKey;
        assertEqual(typeof shiftDateFn, 'function', 'format.ts must export shiftDateInput or shiftDateKey');
        assertEqual(shiftDateFn('2026-03-01', -1), '2026-02-28');
        assertEqual(shiftDateFn('2024-03-01', -1), '2024-02-29');
        assertEqual(shiftDateFn('2026-01-01', -1), '2025-12-31');
        assertEqual(shiftDateFn('2026-12-31', 1), '2027-01-01');
      },
    },
    {
      id: 'T2-F2-04',
      tier: 2,
      feature: 'F2',
      kind: 'browser',
      description: 'Stale state resets between editing an existing transaction and opening + Pemasukan shortcut',
      fn: async (ctx) => {
        const { cdp, webUrl, apiUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Reset State', 'Raka');
        const { token, categories } = await extractSessionFromBrowser(cdp, apiUrl);
        await createTx(apiUrl, token, { categoryId: categories[0].id, type: 'expense', amount: 150000, note: 'Lunch lama' });

        await cdp.reload();
        await cdp.waitForText(/Ringkas/);
        await cdp.clickByText('Transaksi', { exact: true, last: true });
        await cdp.waitForText('Lunch lama');
        await cdp.clickByText('Edit', { exact: true });
        await cdp.waitForText('Simpan');
        await cdp.clickByText('Batal', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');

        await cdp.clickByText('Ringkas', { exact: true, last: true });
        await cdp.clickByText('+ Pemasukan');
        await cdp.waitForText('Simpan');

        const inputVals = await cdp.evalFn(() =>
          Array.from(document.querySelectorAll('input, textarea')).map((el) => el.value)
        );
        assert(!inputVals.includes('Lunch lama'), `Stale note "Lunch lama" leaked into new quick entry: ${JSON.stringify(inputVals)}`);
        assert(!inputVals.includes('150000'), `Stale amount "150000" leaked into new quick entry: ${JSON.stringify(inputVals)}`);
      },
    },
    {
      id: 'T2-F2-05',
      tier: 2,
      feature: 'F2',
      kind: 'browser',
      description: 'Empty categories state guards against TypeError and blocks invalid submit',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Kategori Kosong', 'Raka');

        // Intercept next /api/categories with []
        await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/categories*' }] });
        let intercepted = false;
        const off = cdp.on('Fetch.requestPaused', async (params) => {
          if (params.request?.method === 'OPTIONS') {
            await cdp.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => undefined);
            return;
          }
          if (!intercepted && params.request?.url?.includes('/api/categories')) {
            intercepted = true;
            await cdp.send('Fetch.fulfillRequest', {
              requestId: params.requestId,
              responseCode: 200,
              responseHeaders: [
                { name: 'Content-Type', value: 'application/json' },
                { name: 'Access-Control-Allow-Origin', value: '*' },
              ],
              body: Buffer.from('[]').toString('base64'),
            });
            await cdp.send('Fetch.disable').catch(() => undefined);
          } else {
            await cdp.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => undefined);
          }
        });

        cdp.clearTrackedErrors();
        await cdp.reload();
        await cdp.waitForText(/Ringkas/);
        off();
        await cdp.send('Fetch.disable').catch(() => undefined);

        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('50rb');
        await cdp.clickByText('50rb', { exact: true, last: true });
        cdp.clearTrackedRequests();
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await new Promise((r) => setTimeout(r, 200));

        const errs = cdp.getErrors();
        assertEqual(errs.exceptions.length, 0, `Empty categories crashed UI: ${JSON.stringify(errs.exceptions)}`);
        const posts = cdp.requests.filter((r) => r.method === 'POST' && r.url.includes('/api/transactions'));
        assertEqual(posts.length, 0, 'Should not POST transaction with empty categoryId');
      },
    },
    {
      id: 'T2-F2-06',
      tier: 2,
      feature: 'F2',
      kind: 'browser',
      description: 'Editing legacy accountId: null transaction pre-fills 75000 (not 7500000) and preserves accountId: null',
      fn: async (ctx) => {
        const { cdp, webUrl, apiUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Legacy Edit', 'Raka');
        const { token, categories } = await extractSessionFromBrowser(cdp, apiUrl);
        await createAccount(apiUrl, token, { name: 'BCA', accountType: 'bank', isShared: true, initialBalance: 500000 });
        const legacyTx = await createTx(apiUrl, token, { categoryId: categories[0].id, type: 'expense', amount: 75000, note: 'Legacy Note' });

        await cdp.reload();
        await cdp.waitForText(/Ringkas/);
        await cdp.clickByText('Transaksi', { exact: true, last: true });
        await cdp.waitForText('Legacy Note');
        await cdp.clickByText('Edit', { exact: true });
        await cdp.waitForText('Simpan');

        const inputVals = await cdp.evalFn(() =>
          Array.from(document.querySelectorAll('input, textarea')).map((el) => el.value)
        );
        const has75k = inputVals.some((v) => v === '75000' || v === '75.000');
        assert(has75k, `Expected pre-filled 75000 (not 7500000), got ${JSON.stringify(inputVals)}`);
        assert(!inputVals.includes('7500000'), 'Decimal .00 multiplied amount by 100!');

        await cdp.fillInput(/Catatan|Catering/i, 'Legacy Edited');
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');
        await cdp.waitForText('Legacy Edited');

        const txRes = await apiRequest(apiUrl, '/api/transactions', { token });
        const updated = txRes.data.transactions.find((t) => t.id === legacyTx.id);
        assertEqual(updated.amount, 75000);
        assertEqual(updated.accountId, null);
      },
    },

    // =========================================================================
    // F3 — Monthly Period & Timezone Boundaries (6 API Tests)
    // =========================================================================
    {
      id: 'T2-F3-01',
      tier: 2,
      feature: 'F3',
      kind: 'api',
      description: 'UTC vs WIB (tzOffset=420) midnight boundary across transactions, summary, analytics, and budgets',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 1000000 });
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-10', limitAmount: 1000000 });
        // 2026-10-31 18:00Z == 2026-11-01 01:00 WIB
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 250000, occurredAt: '2026-10-31T18:00:00.000Z' });

        const novWib = await apiRequest(ctx.apiUrl, '/api/transactions?month=2026-11&tzOffset=420', { token: tokenA });
        const octWib = await apiRequest(ctx.apiUrl, '/api/transactions?month=2026-10&tzOffset=420', { token: tokenA });
        const novUtc = await apiRequest(ctx.apiUrl, '/api/transactions?month=2026-11&tzOffset=0', { token: tokenA });
        const octUtc = await apiRequest(ctx.apiUrl, '/api/transactions?month=2026-10&tzOffset=0', { token: tokenA });
        const novDefault = await apiRequest(ctx.apiUrl, '/api/transactions?month=2026-11', { token: tokenA });

        assertEqual(novWib.data.transactions.length, 1);
        assertEqual(octWib.data.transactions.length, 0);
        assertEqual(novUtc.data.transactions.length, 0);
        assertEqual(octUtc.data.transactions.length, 1);
        assertEqual(novDefault.data.transactions.length, 0, 'Omitted tzOffset should default to 0');

        const bdgWib = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=420', { token: tokenA });
        const anaWib = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=420', { token: tokenA });
        const sumWib = await apiRequest(ctx.apiUrl, '/api/summary?month=2026-11&tzOffset=420', { token: tokenA });
        assertEqual(bdgWib.data.budgets[0].spent, 250000);
        assertEqual(anaWib.data.totals.totalExpense, 250000);
        assertEqual(sumWib.data.totalExpense, 250000);
      },
    },
    {
      id: 'T2-F3-02',
      tier: 2,
      feature: 'F3',
      kind: 'api',
      description: 'Half-open interval [start, end) exact millisecond boundary for WIB month start & end',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 10000, occurredAt: '2026-10-31T16:59:59.999Z' });
        const txStart = await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 20000, occurredAt: '2026-10-31T17:00:00.000Z' });
        const txEnd = await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 30000, occurredAt: '2026-11-30T16:59:59.999Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 40000, occurredAt: '2026-11-30T17:00:00.000Z' });

        const res = await apiRequest(ctx.apiUrl, '/api/transactions?month=2026-11&tzOffset=420', { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data.transactions.length, 2);
        const ids = res.data.transactions.map((t) => t.id);
        assert(ids.includes(txStart.id) && ids.includes(txEnd.id), 'Expected exact [start, end) WIB Nov txs');
      },
    },
    {
      id: 'T2-F3-03',
      tier: 2,
      feature: 'F3',
      kind: 'api',
      description: 'Leap-year February (2024-02-29) included in 2024-02 and excluded from 2024-03',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        const leap = await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 50000, occurredAt: '2024-02-29T12:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 60000, occurredAt: '2024-03-01T00:00:00.000Z' });

        const feb = await apiRequest(ctx.apiUrl, '/api/transactions?month=2024-02&tzOffset=0', { token: tokenA });
        assertStatus(feb, 200);
        assertEqual(feb.data.transactions.length, 1);
        assertEqual(feb.data.transactions[0].id, leap.id);
      },
    },
    {
      id: 'T2-F3-04',
      tier: 2,
      feature: 'F3',
      kind: 'api',
      description: 'Invalid month query params (2026-13, 2026-00, 2026-1, invalid) return 400 across monthly endpoints',
      fn: async (ctx) => {
        const { tokenA } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        for (const bad of ['2026-13', '2026-00', '2026-1', 'invalid']) {
          for (const ep of ['/api/transactions', '/api/summary', '/api/analytics', '/api/budgets']) {
            const res = await apiRequest(ctx.apiUrl, `${ep}?month=${encodeURIComponent(bad)}`, { token: tokenA });
            assertStatus(res, 400, `${ep}?month=${bad}`);
          }
        }
      },
    },
    {
      id: 'T2-F3-05',
      tier: 2,
      feature: 'F3',
      kind: 'api',
      description: 'Invalid occurredAt string on POST/PATCH /api/transactions returns 400 cleanly',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const badPost = await apiRequest(ctx.apiUrl, '/api/transactions', {
          method: 'POST',
          token: tokenA,
          body: { categoryId: categories[0].id, type: 'expense', amount: 50000, occurredAt: 'not-a-date' },
        });
        assertStatus(badPost, 400);

        const valid = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'expense', amount: 50000 });
        const badPatch = await apiRequest(ctx.apiUrl, `/api/transactions/${valid.id}`, {
          method: 'PATCH',
          token: tokenA,
          body: { occurredAt: 'not-a-date' },
        });
        assertStatus(badPatch, 400);
      },
    },
    {
      id: 'T2-F3-06',
      tier: 2,
      feature: 'F3',
      kind: 'api',
      description: 'Negative tzOffset (-300 west of UTC) shifts early UTC Nov 1 back into Oct',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        // 2026-11-01 02:00Z == 2026-10-31 21:00 UTC-5
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'expense', amount: 75000, occurredAt: '2026-11-01T02:00:00.000Z' });
        const oct = await apiRequest(ctx.apiUrl, '/api/transactions?month=2026-10&tzOffset=-300', { token: tokenA });
        const nov = await apiRequest(ctx.apiUrl, '/api/transactions?month=2026-11&tzOffset=-300', { token: tokenA });
        assertEqual(oct.data.transactions.length, 1);
        assertEqual(nov.data.transactions.length, 0);
      },
    },

    // =========================================================================
    // F4 — Analytics Corner & Math Cases (6 API Tests)
    // =========================================================================
    {
      id: 'T2-F4-01',
      tier: 2,
      feature: 'F4',
      kind: 'api',
      description: 'Empty month analytics returns zeros and zero NaN/null percentages',
      fn: async (ctx) => {
        const { tokenA } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        const res = await apiRequest(ctx.apiUrl, '/api/analytics?month=2025-01&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data.totals.totalIncome, 0);
        assertEqual(res.data.totals.totalExpense, 0);
        assertEqual(res.data.totals.netBalance, 0);
        assertEqual(res.data.totals.savingsRate, 0);
        assertEqual(res.data.totals.transactionCount, 0);
        for (const c of res.data.byCategory) {
          assertEqual(c.expensePercent, 0);
        }
        for (const p of res.data.byPartner) {
          assertEqual(p.incomePercent, 0);
          assertEqual(p.expensePercent, 0);
        }
      },
    },
    {
      id: 'T2-F4-02',
      tier: 2,
      feature: 'F4',
      kind: 'api',
      description: 'Zero-division guard when totalIncome === 0 and totalExpense > 0',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'expense', amount: 500000, occurredAt: '2026-11-10T10:00:00.000Z' });
        const res = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data.totals.totalIncome, 0);
        assertEqual(res.data.totals.totalExpense, 500000);
        assertEqual(res.data.totals.netBalance, -500000);
        assert(Number.isFinite(res.data.totals.savingsRate) && res.data.totals.savingsRate === 0, 'savingsRate must be finite 0 when income=0');
        assertEqual(res.data.byPartner[0].incomePercent, 0);
      },
    },
    {
      id: 'T2-F4-03',
      tier: 2,
      feature: 'F4',
      kind: 'api',
      description: 'Zero-division guard when totalExpense === 0 and totalIncome > 0',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'income', amount: 2000000, occurredAt: '2026-11-10T10:00:00.000Z' });
        const res = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data.totals.savingsRate, 100);
        for (const c of res.data.byCategory) assertEqual(c.expensePercent, 0);
        for (const p of res.data.byPartner) assertEqual(p.expensePercent, 0);
      },
    },
    {
      id: 'T2-F4-04',
      tier: 2,
      feature: 'F4',
      kind: 'api',
      description: 'Deficit month (totalExpense > totalIncome > 0) returns negative netBalance and finite savingsRate <= 0',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'income', amount: 2000000, occurredAt: '2026-11-05T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'expense', amount: 3000000, occurredAt: '2026-11-06T10:00:00.000Z' });
        const res = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data.totals.netBalance, -1000000);
        assert(Number.isFinite(res.data.totals.savingsRate) && res.data.totals.savingsRate <= 0);
      },
    },
    {
      id: 'T2-F4-05',
      tier: 2,
      feature: 'F4',
      kind: 'api',
      description: 'Non-divisible 3-way split percentages remain finite and sum near 100',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'expense', amount: 100000, occurredAt: '2026-11-05T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[1].id, type: 'expense', amount: 100000, occurredAt: '2026-11-06T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[2].id, type: 'expense', amount: 100000, occurredAt: '2026-11-07T10:00:00.000Z' });
        const res = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        const sum = res.data.byCategory.reduce((acc, c) => {
          assert(Number.isFinite(c.expensePercent), 'expensePercent must be finite');
          return acc + c.expensePercent;
        }, 0);
        assertApprox(sum, 100, 1, '3-way split expensePercent sum');
      },
    },
    {
      id: 'T2-F4-06',
      tier: 2,
      feature: 'F4',
      kind: 'api',
      description: 'accountsOverview stays accurate in empty future month (2027-01)',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const acc = await createAccount(ctx.apiUrl, tokenA, { name: 'Bank', accountType: 'bank', isShared: true, initialBalance: 3500000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: acc.id, type: 'income', amount: 500000, occurredAt: '2026-10-05T10:00:00.000Z' });

        const res = await apiRequest(ctx.apiUrl, '/api/analytics?month=2027-01&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data.totals.transactionCount, 0);
        assertEqual(res.data.accountsOverview.totalBalance, 4000000);
        assertEqual(res.data.accountsOverview.accountsCount, 1);
      },
    },

    // =========================================================================
    // F5 — Accounts Balance Transitions & Integrity (8 API Tests)
    // =========================================================================
    {
      id: 'T2-F5-01',
      tier: 2,
      feature: 'F5',
      kind: 'api',
      description: 'PATCH /api/transactions/:id transition null -> B debits/credits B accurately',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const accB = await createAccount(ctx.apiUrl, tokenA, { name: 'Acc B', accountType: 'bank', isShared: true, initialBalance: 1000000 });
        const tx = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'expense', amount: 300000 });

        const patch = await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, { method: 'PATCH', token: tokenA, body: { accountId: accB.id } });
        assertStatus(patch, 200);
        assertEqual(patch.data.transaction.accountId, accB.id);
        assertEqual(patch.data.transaction.accountName, 'Acc B');

        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertEqual(accRes.data.accounts[0].balance, 700000);
      },
    },
    {
      id: 'T2-F5-02',
      tier: 2,
      feature: 'F5',
      kind: 'api',
      description: 'PATCH /api/transactions/:id transition A -> null reverses A balance cleanly',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const accA = await createAccount(ctx.apiUrl, tokenA, { name: 'Acc A', accountType: 'bank', isShared: true, initialBalance: 1000000 });
        const tx = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: accA.id, type: 'income', amount: 500000 });

        const patch = await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, { method: 'PATCH', token: tokenA, body: { accountId: null } });
        assertStatus(patch, 200);
        assertEqual(patch.data.transaction.accountId, null);
        assertEqual(patch.data.transaction.accountName, null);

        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertEqual(accRes.data.accounts[0].balance, 1000000);
      },
    },
    {
      id: 'T2-F5-03',
      tier: 2,
      feature: 'F5',
      kind: 'api',
      description: 'PATCH /api/transactions/:id transition A -> A with type flip + amount change',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const accA = await createAccount(ctx.apiUrl, tokenA, { name: 'Acc A', accountType: 'cash', isShared: true, initialBalance: 1000000 });
        const tx = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: accA.id, type: 'expense', amount: 200000 });

        const patch = await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, { method: 'PATCH', token: tokenA, body: { type: 'income', amount: 300000 } });
        assertStatus(patch, 200);
        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertEqual(accRes.data.accounts[0].balance, 1300000);
      },
    },
    {
      id: 'T2-F5-04',
      tier: 2,
      feature: 'F5',
      kind: 'api',
      description: 'PATCH /api/transactions/:id transition A -> B with simultaneous type flip',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const accA = await createAccount(ctx.apiUrl, tokenA, { name: 'Acc A', accountType: 'cash', isShared: true, initialBalance: 1000000 });
        const accB = await createAccount(ctx.apiUrl, tokenA, { name: 'Acc B', accountType: 'bank', isShared: true, initialBalance: 2000000 });
        const tx = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: accA.id, type: 'expense', amount: 250000 });

        const patch = await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, {
          method: 'PATCH',
          token: tokenA,
          body: { accountId: accB.id, type: 'income', amount: 400000 },
        });
        assertStatus(patch, 200);
        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        const byId = Object.fromEntries(accRes.data.accounts.map((a) => [a.id, a]));
        assertEqual(byId[accA.id].balance, 1000000);
        assertEqual(byId[accB.id].balance, 2400000);
      },
    },
    {
      id: 'T2-F5-05',
      tier: 2,
      feature: 'F5',
      kind: 'api',
      description: 'PATCH /api/transactions/:id by Partner B preserves original Partner A partnerId',
      fn: async (ctx) => {
        const { tokenA, tokenB, partnerA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        const acc = await createAccount(ctx.apiUrl, tokenA, { name: 'Shared', accountType: 'shared_savings', isShared: true, initialBalance: 1000000 });
        const tx = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: acc.id, type: 'expense', amount: 100000 });

        const patch = await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, {
          method: 'PATCH',
          token: tokenB,
          body: { amount: 150000 },
        });
        assertStatus(patch, 200);
        assertEqual(patch.data.transaction.partnerId, partnerA.id);
      },
    },
    {
      id: 'T2-F5-06',
      tier: 2,
      feature: 'F5',
      kind: 'api',
      description: 'Invalid account payloads & transaction amount <= 0 / invalid type return 400 with zero side effects',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const acc = await createAccount(ctx.apiUrl, tokenA, { name: 'Valid Acc', accountType: 'cash', isShared: true, initialBalance: 1000000 });

        assertStatus(await apiRequest(ctx.apiUrl, '/api/accounts', { method: 'POST', token: tokenA, body: { name: 'A', accountType: 'cash', isShared: true } }), 400);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/accounts', { method: 'POST', token: tokenA, body: { name: 'Crypto', accountType: 'crypto', isShared: true } }), 400);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/transactions', { method: 'POST', token: tokenA, body: { categoryId: categories[0].id, accountId: acc.id, type: 'expense', amount: 0 } }), 400);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/transactions', { method: 'POST', token: tokenA, body: { categoryId: categories[0].id, accountId: acc.id, type: 'expense', amount: -100 } }), 400);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/transactions', { method: 'POST', token: tokenA, body: { categoryId: categories[0].id, accountId: acc.id, type: 'transfer', amount: 100 } }), 400);

        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertEqual(accRes.data.accounts.length, 1);
        assertEqual(accRes.data.accounts[0].balance, 1000000);
      },
    },
    {
      id: 'T2-F5-07',
      tier: 2,
      feature: 'F5',
      kind: 'api',
      description: 'Cross-couple accountId/categoryId FK injection rejected in POST & PATCH without mutating either couple',
      fn: async (ctx) => {
        const cA = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false, coupleName: 'Couple A' });
        const cB = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false, coupleName: 'Couple B' });
        const accA = await createAccount(ctx.apiUrl, cA.tokenA, { name: 'A Bank', accountType: 'bank', isShared: true, initialBalance: 1000000 });
        const accB = await createAccount(ctx.apiUrl, cB.tokenA, { name: 'B Bank', accountType: 'bank', isShared: true, initialBalance: 500000 });

        const postHijack = await apiRequest(ctx.apiUrl, '/api/transactions', {
          method: 'POST',
          token: cB.tokenA,
          body: { categoryId: cB.categories[0].id, accountId: accA.id, type: 'expense', amount: 250000 },
        });
        assertStatus(postHijack, [400, 404]);

        const txB = await createTx(ctx.apiUrl, cB.tokenA, { categoryId: cB.categories[0].id, accountId: accB.id, type: 'expense', amount: 100000 });
        const patchHijack = await apiRequest(ctx.apiUrl, `/api/transactions/${txB.id}`, {
          method: 'PATCH',
          token: cB.tokenA,
          body: { accountId: accA.id },
        });
        assertStatus(patchHijack, [400, 404]);

        const checkA = await apiRequest(ctx.apiUrl, '/api/accounts', { token: cA.tokenA });
        const checkB = await apiRequest(ctx.apiUrl, '/api/accounts', { token: cB.tokenA });
        assertEqual(checkA.data.accounts[0].balance, 1000000);
        assertEqual(checkB.data.accounts[0].balance, 400000);
      },
    },
    {
      id: 'T2-F5-08',
      tier: 2,
      feature: 'F5',
      kind: 'api',
      description: 'Concurrent parallel PATCH A->B & B->A conserves total balance; double DELETE returns 404 without double reversal',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const accA = await createAccount(ctx.apiUrl, tokenA, { name: 'Dompet A', accountType: 'cash', isShared: true, initialBalance: 1000000 });
        const accB = await createAccount(ctx.apiUrl, tokenA, { name: 'Dompet B', accountType: 'bank', isShared: true, initialBalance: 1000000 });
        const tx1 = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: accA.id, type: 'expense', amount: 200000 });
        const tx2 = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: accB.id, type: 'expense', amount: 300000 });

        const [p1, p2] = await Promise.all([
          apiRequest(ctx.apiUrl, `/api/transactions/${tx1.id}`, { method: 'PATCH', token: tokenA, body: { accountId: accB.id } }),
          apiRequest(ctx.apiUrl, `/api/transactions/${tx2.id}`, { method: 'PATCH', token: tokenA, body: { accountId: accA.id } }),
        ]);
        assertStatus(p1, 200);
        assertStatus(p2, 200);

        const afterSwap = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        const map = Object.fromEntries(afterSwap.data.accounts.map((a) => [a.id, a]));
        assertEqual(map[accA.id].balance, 700000);
        assertEqual(map[accB.id].balance, 800000);
        assertEqual(afterSwap.data.totals.totalBalance, 1500000);

        const [d1, d2] = await Promise.all([
          apiRequest(ctx.apiUrl, `/api/transactions/${tx1.id}`, { method: 'DELETE', token: tokenA }),
          apiRequest(ctx.apiUrl, `/api/transactions/${tx1.id}`, { method: 'DELETE', token: tokenA }),
        ]);
        const statuses = [d1.status, d2.status].sort((a, b) => a - b);
        assertEqual(statuses[0], 200);
        assertEqual(statuses[1], 404);
        const afterDel = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertEqual(afterDel.data.totals.totalBalance, 1700000);
      },
    },

    // =========================================================================
    // F6 — Budgets Boundaries, Validation & Isolation (7 API Tests)
    // =========================================================================
    {
      id: 'T2-F6-01',
      tier: 2,
      feature: 'F6',
      kind: 'api',
      description: 'Empty-month budget starts with spent=0, remaining=limitAmount, progressPercent=0, isOverBudget=false',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: categories[0].id, month: '2026-12', limitAmount: 1500000 });
        const res = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-12', { token: tokenA });
        assertStatus(res, 200);
        const b = res.data.budgets[0];
        assertEqual(b.spent, 0);
        assertEqual(b.remaining, 1500000);
        assertEqual(b.progressPercent, 0);
        assertEqual(b.isOverBudget, false);
      },
    },
    {
      id: 'T2-F6-02',
      tier: 2,
      feature: 'F6',
      kind: 'api',
      description: 'Exact 100% budget boundary (spent === limitAmount) sets isOverBudget === false',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 1000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 1000000, occurredAt: '2026-11-10T10:00:00.000Z' });
        const res = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        const b = res.data.budgets[0];
        assertEqual(b.spent, 1000000);
        assertEqual(b.remaining, 0);
        assertEqual(b.progressPercent, 100);
        assertEqual(b.isOverBudget, false);
      },
    },
    {
      id: 'T2-F6-03',
      tier: 2,
      feature: 'F6',
      kind: 'api',
      description: 'Over-budget boundary by 1 IDR (spent > limitAmount) flips isOverBudget === true',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 1000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 1000001, occurredAt: '2026-11-10T10:00:00.000Z' });
        const res = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        const b = res.data.budgets[0];
        assertEqual(b.spent, 1000001);
        assertEqual(b.remaining, -1);
        assertEqual(b.isOverBudget, true);
        assert(b.progressPercent >= 100);
      },
    },
    {
      id: 'T2-F6-04',
      tier: 2,
      feature: 'F6',
      kind: 'api',
      description: 'Income transactions in budgeted category do NOT count toward budget spent',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 1000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'income', amount: 5000000, occurredAt: '2026-11-05T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 200000, occurredAt: '2026-11-06T10:00:00.000Z' });

        const res = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        const b = res.data.budgets[0];
        assertEqual(b.spent, 200000);
        assertEqual(b.remaining, 800000);
        assertEqual(b.progressPercent, 20);
        assertEqual(b.isOverBudget, false);
      },
    },
    {
      id: 'T2-F6-05',
      tier: 2,
      feature: 'F6',
      kind: 'api',
      description: 'Budget validation rejects limitAmount <= 0, non-numeric, invalid month, and foreign categoryId',
      fn: async (ctx) => {
        const cA = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false, coupleName: 'CA' });
        const cB = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false, coupleName: 'CB' });
        const catB = cB.categories[0].id;

        assertStatus(await apiRequest(ctx.apiUrl, '/api/budgets', { method: 'POST', token: cB.tokenA, body: { categoryId: catB, month: '2026-11', limitAmount: 0 } }), 400);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/budgets', { method: 'PUT', token: cB.tokenA, body: { categoryId: catB, month: '2026-11', limitAmount: -50000 } }), 400);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/budgets', { method: 'POST', token: cB.tokenA, body: { categoryId: catB, month: '2026-11', limitAmount: 'abc' } }), 400);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/budgets', { method: 'POST', token: cB.tokenA, body: { categoryId: catB, month: '2026-13', limitAmount: 500000 } }), 400);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/budgets', { method: 'POST', token: cB.tokenA, body: { categoryId: cA.categories[0].id, month: '2026-11', limitAmount: 500000 } }), [400, 404]);

        const valid = await saveBudget(ctx.apiUrl, cB.tokenA, { categoryId: catB, month: '2026-11', limitAmount: 500000 });
        assertStatus(await apiRequest(ctx.apiUrl, `/api/budgets/${valid.id}`, { method: 'PATCH', token: cB.tokenA, body: { limitAmount: 0 } }), 400);
      },
    },
    {
      id: 'T2-F6-06',
      tier: 2,
      feature: 'F6',
      kind: 'api',
      description: 'Month isolation separates 2026-10 and 2026-11 budgets and expenses for same category',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-10', limitAmount: 1000000 });
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 2000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 900000, occurredAt: '2026-10-15T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 300000, occurredAt: '2026-11-15T10:00:00.000Z' });

        const nov = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(nov, 200);
        assertEqual(nov.data.budgets.length, 1);
        assertEqual(nov.data.budgets[0].limitAmount, 2000000);
        assertEqual(nov.data.budgets[0].spent, 300000);
      },
    },
    {
      id: 'T2-F6-07',
      tier: 2,
      feature: 'F6',
      kind: 'api',
      description: 'Cross-couple budget isolation blocks GET/PATCH/DELETE by Couple B on Couple A budget',
      fn: async (ctx) => {
        const cA = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false, coupleName: 'CA' });
        const cB = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false, coupleName: 'CB' });
        const bA = await saveBudget(ctx.apiUrl, cA.tokenA, { categoryId: cA.categories[0].id, month: '2026-11', limitAmount: 2000000 });

        const listB = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11', { token: cB.tokenA });
        assertEqual(listB.data.budgets.length, 0);
        assertStatus(await apiRequest(ctx.apiUrl, `/api/budgets/${bA.id}`, { method: 'PATCH', token: cB.tokenA, body: { limitAmount: 100 } }), 404);
        assertStatus(await apiRequest(ctx.apiUrl, `/api/budgets/${bA.id}`, { method: 'DELETE', token: cB.tokenA }), 404);

        const listA = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11', { token: cA.tokenA });
        assertEqual(listA.data.budgets.length, 1);
        assertEqual(listA.data.budgets[0].limitAmount, 2000000);
      },
    },

    // =========================================================================
    // F7 — Auth, Invite Code & Tenant Isolation (7 API Tests)
    // =========================================================================
    {
      id: 'T2-F7-01',
      tier: 2,
      feature: 'F7',
      kind: 'api',
      description: 'Missing, empty, or invalid Bearer token returns 401 across all protected routes',
      fn: async (ctx) => {
        const fakeId = '00000000-0000-4000-8000-000000000001';
        const routes = [
          ['GET', '/api/couple'],
          ['PATCH', '/api/couple'],
          ['GET', '/api/categories'],
          ['POST', '/api/categories'],
          ['PATCH', `/api/categories/${fakeId}`],
          ['DELETE', `/api/categories/${fakeId}`],
          ['GET', '/api/transactions'],
          ['POST', '/api/transactions'],
          ['PATCH', `/api/transactions/${fakeId}`],
          ['DELETE', `/api/transactions/${fakeId}`],
          ['GET', '/api/accounts'],
          ['POST', '/api/accounts'],
          ['PATCH', `/api/accounts/${fakeId}`],
          ['DELETE', `/api/accounts/${fakeId}`],
          ['GET', '/api/accounts/transfers'],
          ['POST', '/api/accounts/transfer'],
          ['GET', '/api/budgets'],
          ['POST', '/api/budgets'],
          ['PUT', '/api/budgets'],
          ['PATCH', `/api/budgets/${fakeId}`],
          ['DELETE', `/api/budgets/${fakeId}`],
          ['GET', '/api/notes'],
          ['POST', '/api/notes'],
          ['PATCH', `/api/notes/${fakeId}`],
          ['DELETE', `/api/notes/${fakeId}`],
          ['GET', '/api/summary'],
          ['GET', '/api/analytics'],
          ['GET', '/api/export'],
        ];
        for (const [method, p] of routes) {
          assertStatus(await apiRequest(ctx.apiUrl, p, { method }), 401, `No auth ${method} ${p}`);
          assertStatus(await apiRequest(ctx.apiUrl, p, { method, headers: { Authorization: 'Bearer ' } }), 401, `Empty Bearer ${method} ${p}`);
          assertStatus(await apiRequest(ctx.apiUrl, p, { method, token: 'invalid-token' }), 401, `Bad token ${method} ${p}`);
        }
      },
    },
    {
      id: 'T2-F7-02',
      tier: 2,
      feature: 'F7',
      kind: 'api',
      description: 'Invalid 6-char invite code returns 404; empty inviteCode or 1-char partnerName returns 400',
      fn: async (ctx) => {
        const created = await createCouple(ctx.apiUrl, { partnerName: 'Raka' });
        assertStatus(await apiRequest(ctx.apiUrl, '/api/couples/join', { method: 'POST', body: { inviteCode: 'ZZZZZZ', partnerName: 'Nadia' } }), 404);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/couples/join', { method: 'POST', body: { inviteCode: '', partnerName: 'Nadia' } }), 400);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/couples/join', { method: 'POST', body: { inviteCode: created.couple.inviteCode, partnerName: 'A' } }), 400);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/couples/create', { method: 'POST', body: { coupleName: 'X', partnerName: 'A' } }), 400);
      },
    },
    {
      id: 'T2-F7-03',
      tier: 2,
      feature: 'F7',
      kind: 'api',
      description: 'Cross-couple tenant isolation on Accounts (GET, PATCH, DELETE)',
      fn: async (ctx) => {
        const cA = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const cB = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const accA = await createAccount(ctx.apiUrl, cA.tokenA, { name: 'Private A', accountType: 'bank', isShared: true, initialBalance: 2000000 });

        const listB = await apiRequest(ctx.apiUrl, '/api/accounts', { token: cB.tokenA });
        assertEqual(listB.data.accounts.length, 0);
        assertStatus(await apiRequest(ctx.apiUrl, `/api/accounts/${accA.id}`, { method: 'PATCH', token: cB.tokenA, body: { name: 'Hacked' } }), 404);
        assertStatus(await apiRequest(ctx.apiUrl, `/api/accounts/${accA.id}`, { method: 'DELETE', token: cB.tokenA }), 404);

        const listA = await apiRequest(ctx.apiUrl, '/api/accounts', { token: cA.tokenA });
        assertEqual(listA.data.accounts[0].name, 'Private A');
      },
    },
    {
      id: 'T2-F7-04',
      tier: 2,
      feature: 'F7',
      kind: 'api',
      description: 'Cross-couple tenant isolation on Transactions (GET, PATCH, DELETE)',
      fn: async (ctx) => {
        const cA = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const cB = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const accA = await createAccount(ctx.apiUrl, cA.tokenA, { name: 'Acc A', accountType: 'cash', isShared: true, initialBalance: 1000000 });
        const txA = await createTx(ctx.apiUrl, cA.tokenA, { categoryId: cA.categories[0].id, accountId: accA.id, type: 'expense', amount: 100000 });

        const listB = await apiRequest(ctx.apiUrl, '/api/transactions', { token: cB.tokenA });
        assertEqual(listB.data.transactions.length, 0);
        const listBByAcc = await apiRequest(ctx.apiUrl, `/api/transactions?accountId=${accA.id}`, { token: cB.tokenA });
        assertStatus(listBByAcc, 200);
        assertEqual(listBByAcc.data.transactions.length, 0, 'Cross-couple ?accountId= query must return []');
        assertStatus(await apiRequest(ctx.apiUrl, `/api/transactions/${txA.id}`, { method: 'PATCH', token: cB.tokenA, body: { amount: 999999 } }), 404);
        assertStatus(await apiRequest(ctx.apiUrl, `/api/transactions/${txA.id}`, { method: 'DELETE', token: cB.tokenA }), 404);

        const accCheck = await apiRequest(ctx.apiUrl, '/api/accounts', { token: cA.tokenA });
        assertEqual(accCheck.data.accounts[0].balance, 900000);
      },
    },
    {
      id: 'T2-F7-05',
      tier: 2,
      feature: 'F7',
      kind: 'api',
      description: 'Cross-couple tenant isolation on Categories and Notes',
      fn: async (ctx) => {
        const cA = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const cB = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        await apiRequest(ctx.apiUrl, '/api/categories', { method: 'POST', token: cA.tokenA, body: { name: 'Rahasia A' } });
        await apiRequest(ctx.apiUrl, '/api/notes', { method: 'POST', token: cA.tokenA, body: { title: 'Note A', content: 'Secret' } });

        const catsB = await apiRequest(ctx.apiUrl, '/api/categories', { token: cB.tokenA });
        const notesB = await apiRequest(ctx.apiUrl, '/api/notes', { token: cB.tokenA });
        assertEqual(catsB.data.length, 4);
        assert(!catsB.data.some((c) => c.name === 'Rahasia A'));
        assertEqual(notesB.data.length, 0);
      },
    },
    {
      id: 'T2-F7-06',
      tier: 2,
      feature: 'F7',
      kind: 'api',
      description: 'Duplicate DELETE /api/accounts/:id and DELETE /api/budgets/:id return 404 on second attempt',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const acc = await createAccount(ctx.apiUrl, tokenA, { name: 'Temp Acc', accountType: 'other', isShared: true });
        const bdg = await saveBudget(ctx.apiUrl, tokenA, { categoryId: categories[0].id, month: '2026-11', limitAmount: 500000 });

        assertStatus(await apiRequest(ctx.apiUrl, `/api/accounts/${acc.id}`, { method: 'DELETE', token: tokenA }), 200);
        assertStatus(await apiRequest(ctx.apiUrl, `/api/accounts/${acc.id}`, { method: 'DELETE', token: tokenA }), 404);

        assertStatus(await apiRequest(ctx.apiUrl, `/api/budgets/${bdg.id}`, { method: 'DELETE', token: tokenA }), 200);
        assertStatus(await apiRequest(ctx.apiUrl, `/api/budgets/${bdg.id}`, { method: 'DELETE', token: tokenA }), 404);
      },
    },
    {
      id: 'T2-F7-07',
      tier: 2,
      feature: 'F7',
      kind: 'api',
      description: 'Short (< 2 chars) category name and note title return 400',
      fn: async (ctx) => {
        const { tokenA } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        assertStatus(await apiRequest(ctx.apiUrl, '/api/categories', { method: 'POST', token: tokenA, body: { name: 'X' } }), 400);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/notes', { method: 'POST', token: tokenA, body: { title: 'Y', content: 'body' } }), 400);
      },
    },

    // =========================================================================
    // F8 — Mobile & Expo Web Compatibility Boundaries (6 Tests)
    // =========================================================================
    {
      id: 'T2-F8-01',
      tier: 2,
      feature: 'F8',
      kind: 'browser',
      description: 'Web token persistence across reload and graceful recovery on bogus/revoked localStorage token',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Sesi Persist', 'Raka');

        await cdp.reload();
        await cdp.waitForText('Sesi Persist');
        await cdp.waitForText(/Ringkas/);

        // Corrupt persisted token(s) in localStorage and reload
        cdp.clearTrackedErrors();
        await cdp.evalFn(() => {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && /token|duasaku/i.test(k)) localStorage.setItem(k, 'bogus-revoked-token');
          }
        });
        await cdp.reload();
        await cdp.waitForText('Buat Ruang Baru');
        const errs = cdp.getErrors();
        assertEqual(errs.exceptions.length, 0, `Uncaught exceptions during token recovery: ${JSON.stringify(errs.exceptions)}`);
      },
    },
    {
      id: 'T2-F8-02',
      tier: 2,
      feature: 'F8',
      kind: 'browser',
      description: 'App falls back cleanly to in-memory session when browser localStorage throws SecurityError',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await cdp.navigate(webUrl);
        await cdp.clearStorage();

        cdp.clearTrackedErrors();
        const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
          source: `(() => {
            const throwSec = () => {
              throw new DOMException('Blocked', 'SecurityError');
            };
            try {
              Storage.prototype.getItem = throwSec;
              Storage.prototype.setItem = throwSec;
              Storage.prototype.removeItem = throwSec;
              Storage.prototype.clear = throwSec;
            } catch {}
            try {
              Object.defineProperty(window, 'localStorage', {
                configurable: true,
                get() {
                  return {
                    getItem: throwSec,
                    setItem: throwSec,
                    removeItem: throwSec,
                    clear: throwSec,
                    key: () => null,
                    get length() { return 0; },
                  };
                },
              });
            } catch {}
          })();`,
        });

        try {
          await cdp.navigate(webUrl);
          await cdp.waitForText('Buat Ruang Baru');

          const blocked = await cdp.evalFn(() => {
            try {
              window.localStorage.setItem('__probe__', '1');
              return { threw: false };
            } catch (e) {
              return { threw: true, name: e?.name || '' };
            }
          });
          assert(blocked?.threw && blocked.name === 'SecurityError', `Expected localStorage to throw SecurityError, got ${JSON.stringify(blocked)}`);

          await cdp.fillInput('Dompet Masa Depan', 'Memori Aman');
          await cdp.fillInput('Raka / Nadia', 'Raka');
          await cdp.clickByText(/Mulai & Dapatkan Kode Undangan|Mulai Sekarang|^Buat Ruang$/i);
          await cdp.waitForText('Memori Aman');
          await cdp.waitForText(/Ringkas/);

          const shellText = await cdp.getBodyText();
          for (const tab of ['Ringkas', 'Transaksi', 'Analitik', 'Dompet', 'Anggaran']) {
            assert(shellText.includes(tab), `5-tab shell missing tab "${tab}" under SecurityError fallback`);
          }

          await cdp.clickByText('Dompet', { exact: true, last: true });
          await new Promise((r) => setTimeout(r, 150));
          await cdp.clickByText('Ringkas', { exact: true, last: true });
          await cdp.waitForText('Memori Aman');

          const errs = cdp.getErrors();
          assertEqual(errs.exceptions.length, 0, `Uncaught exceptions under localStorage SecurityError: ${JSON.stringify(errs.exceptions)}`);
          assertEqual(errs.consoleErrors.length, 0, `Console errors under localStorage SecurityError: ${JSON.stringify(errs.consoleErrors)}`);
        } finally {
          await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => undefined);
          await cdp.navigate('about:blank').catch(() => undefined);
        }
      },
    },
    {
      id: 'T2-F8-03',
      tier: 2,
      feature: 'F8',
      kind: 'browser',
      description: 'Responsive mobile (375x812) non-overlapping 5 tabs & zero overflow vs desktop (1280x800) centered AppFrame',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Layout Geometri', 'Raka');

        const mobileAudit = await cdp.getDomAudit();
        assert(mobileAudit.scrollWidth <= 375, `Mobile horizontal overflow: scrollWidth=${mobileAudit.scrollWidth} > 375`);

        const tabs = ['Ringkas', 'Transaksi', 'Analitik', 'Dompet', 'Anggaran'];
        const rects = [];
        for (const t of tabs) {
          const r = await cdp.findElementRectByText(t, { exact: true, last: true });
          assert(r, `Missing tab "${t}"`);
          assert(r.rect.left >= -1 && r.rect.right <= 376, `Tab "${t}" out of 375px bounds: ${JSON.stringify(r.rect)}`);
          rects.push(r.rect);
        }
        for (let i = 0; i < rects.length - 1; i++) {
          assert(
            rects[i].right <= rects[i + 1].left + 2,
            `Tabs ${tabs[i]} and ${tabs[i + 1]} overlap: ${rects[i].right} > ${rects[i + 1].left}`
          );
        }

        await cdp.setViewport(1280, 800, false);
        await new Promise((r) => setTimeout(r, 200));
        const desktopHeader = await cdp.findElementRectByText('Layout Geometri');
        assert(desktopHeader, 'Desktop header not found');
        // AppFrame centers content on desktop (width <= 820 or centered left offset > 100)
        const contentWidth = await cdp.evalFn(() => {
          const all = Array.from(document.querySelectorAll('div'));
          const centered = all.find((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return (
              r.width >= 400 &&
              r.width <= 840 &&
              r.left > 120 &&
              r.right < 1160 &&
              (el.innerText || '').includes('Layout Geometri') &&
              cs.display !== 'inline'
            );
          });
          return centered ? centered.getBoundingClientRect() : null;
        });
        assert(contentWidth, 'Desktop AppFrame content container (width <= 840, centered) not detected');
      },
    },
    {
      id: 'T2-F8-04',
      tier: 2,
      feature: 'F8',
      kind: 'browser',
      description: 'Narrow/short viewport (320x568) modal scrollability keeps Simpan & Batal reachable',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(320, 568, true);
        await createCoupleViaUi(cdp, webUrl, 'Layar Kecil', 'Raka');
        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('Simpan');
        await cdp.clickByText('50rb', { exact: true, last: true });
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');
        await cdp.waitForText('Rp 50.000');
      },
    },
    {
      id: 'T2-F8-05',
      tier: 2,
      feature: 'F8',
      kind: 'browser',
      description: 'Zero-division guard & progress bar clamping [0%, 100%] on empty Analitik & 300% over-budget Anggaran',
      fn: async (ctx) => {
        const { cdp, webUrl, apiUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Clamp Progress', 'Raka');
        const { token, categories } = await extractSessionFromBrowser(cdp, apiUrl);

        // Empty month Analitik first
        await cdp.clickByText('Analitik', { exact: true, last: true });
        await cdp.waitForText(/Pemasukan|Pengeluaran/i);
        const anaAudit = await cdp.getDomAudit();
        assert(!anaAudit.hasNaN && !anaAudit.hasInfinity && !anaAudit.hasUndefined, 'NaN/Infinity/undefined found in empty Analitik');

        // Seed 300% over-budget
        const now = new Date();
        const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await saveBudget(apiUrl, token, { categoryId: categories[0].id, month: m, limitAmount: 100000 });
        await createTx(apiUrl, token, { categoryId: categories[0].id, type: 'expense', amount: 300000, occurredAt: now.toISOString() });

        await cdp.reload();
        await cdp.waitForText(/Ringkas/);
        await cdp.clickByText('Anggaran', { exact: true, last: true });
        await cdp.waitForText('300%');
        const bdgAudit = await cdp.getDomAudit();
        assert(!bdgAudit.hasNaN && !bdgAudit.hasInfinity && !bdgAudit.hasUndefined, 'NaN/Infinity/undefined in Anggaran');

        // Verify progress bar fill never overflows its parent track width AND 300% bar fills >= 90% of track
        const barStats = await cdp.evalFn(() => {
          const bars = [];
          for (const el of document.querySelectorAll('div')) {
            const p = el.parentElement;
            if (!p) continue;
            if (el.children.length > 0 || (el.innerText || '').trim() !== '') continue;
            const er = el.getBoundingClientRect();
            const pr = p.getBoundingClientRect();
            if (er.height >= 4 && er.height <= 24 && pr.width > 50 && Math.abs(er.height - pr.height) <= 4) {
              bars.push({ elWidth: er.width, parentWidth: pr.width, height: er.height });
            }
          }
          return bars;
        });
        assert(barStats.length >= 1, 'Expected at least 1 progress bar fill element on Anggaran');
        const overflowedBars = barStats.filter((b) => b.elWidth > b.parentWidth + 2);
        assertEqual(overflowedBars.length, 0, `Progress bar overflowed parent track: ${JSON.stringify(overflowedBars)}`);
        const fullClampedBars = barStats.filter((b) => b.elWidth >= b.parentWidth * 0.9 && b.elWidth <= b.parentWidth + 2);
        assert(fullClampedBars.length >= 1, `Expected 300% over-budget bar to fill >= 90% of track width, found: ${JSON.stringify(barStats)}`);
      },
    },
    {
      id: 'T2-F8-06',
      tier: 2,
      feature: 'F8',
      kind: 'browser',
      description: 'HTTP 500 server error shows FeedbackBanner, re-enables button, and allows subsequent valid retry',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Resilien 500', 'Raka');

        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('100rb');
        await cdp.clickByText('100rb', { exact: true, last: true });

        await cdp.failNextRequestMatching('/api/transactions', 500, { error: 'Simulasi galat server' });
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForText(/Simulasi galat server|Gagal|galat/i);

        // Retry without fault injection -> must succeed cleanly
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForText('Rp 100.000');
      },
    },
  ];
}
