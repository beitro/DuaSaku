// Tier 1 — Core Feature Contract Tests (49 tests: 31 HTTP API for F3–F7 + 18 UI/Theme/Web for F1, F2, F8)

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  PROJECT_ROOT,
  apiRequest,
  assert,
  assertEqual,
  assertMatch,
  assertStatus,
  createAccount,
  createCouple,
  createTx,
  joinCouple,
  saveBudget,
  setupCoupleContext,
} from '../lib/harness.mjs';
import {
  evaluatePaletteContracts,
  isValidHex6or8,
  isWarmEarthTone,
  parseColor,
  relativeLuminance,
  scanLegacyColors,
} from '../lib/wcag.mjs';

const execFileAsync = promisify(execFile);

async function listProjectSourceFiles() {
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
      if (entry.isDirectory()) {
        await walk(full);
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
        results.push(full);
      }
    }
  }
  await walk(path.join(PROJECT_ROOT, 'src'));
  results.push(path.join(PROJECT_ROOT, 'App.tsx'));
  results.push(path.join(PROJECT_ROOT, 'app.json'));
  return results;
}

async function importTsFresh(relPath) {
  const abs = path.join(PROJECT_ROOT, relPath);
  const url = new URL(`file://${abs}?t=${Date.now()}_${Math.random()}`);
  return await import(url.href);
}

async function createCoupleInBrowser(cdp, webUrl, coupleName = 'Dompet E2E', partnerName = 'Raka') {
  const email = `${partnerName.toLowerCase().replace(/[^a-z0-9]/g, '')}.${Date.now()}.${Math.floor(Math.random() * 10000)}@duasaku.test`;
  await cdp.navigate(webUrl);
  await cdp.clearStorage();
  await cdp.reload();
  await cdp.waitForText('Buat Akun');
  await cdp.clickByText('Buat Akun', { exact: true });
  await cdp.waitForText('Lanjut Pilih Ruang');
  await cdp.fillInput('Contoh: Raka atau Nadia', partnerName);
  await cdp.fillInput('nama@email.com', email);
  await cdp.fillInput('Minimal 6 karakter', 'duasaku123');
  await cdp.clickByText('Lanjut Pilih Ruang', { exact: true });
  await cdp.waitForText('Buat Ruang Baru');
  await cdp.fillInput('Contoh: Dompet Masa Depan', coupleName);
  await cdp.clickByText('Buat Akun & Mulai Ruang', { exact: true });
  await cdp.waitForText(coupleName);
  await cdp.waitForText(/Ringkas/);
}

export function getTier1Tests() {
  return [
    // =========================================================================
    // F1 — Warm Earth-Tone Palette (6 Tests)
    // =========================================================================
    {
      id: 'T1-F1-01',
      tier: 1,
      feature: 'F1',
      kind: 'static',
      description: 'app.json android.adaptiveIcon.backgroundColor uses warm earth-tone hex (not legacy #10B981)',
      fn: async () => {
        const raw = await fs.readFile(path.join(PROJECT_ROOT, 'app.json'), 'utf8');
        const cfg = JSON.parse(raw);
        const bg = cfg?.expo?.android?.adaptiveIcon?.backgroundColor;
        assert(isValidHex6or8(bg), `adaptiveIcon.backgroundColor invalid hex: ${bg}`);
        assert(bg.toUpperCase() !== '#10B981', 'adaptiveIcon.backgroundColor is still legacy #10B981');
        assert(isWarmEarthTone(bg), `adaptiveIcon.backgroundColor ${bg} is not a warm earth tone`);
      },
    },
    {
      id: 'T1-F1-02',
      tier: 1,
      feature: 'F1',
      kind: 'static',
      description: 'src/theme/tokens.ts exports warm earth-tone palette (cream, espresso, terracotta, sage, sand, hero cocoa)',
      fn: async () => {
        const tokensMod = await importTsFresh('src/theme/tokens.ts');
        const evaluation = evaluatePaletteContracts(tokensMod);
        const r = evaluation.resolved;
        assert(r.cream, 'Missing warm cream background token in src/theme/tokens.ts');
        assert(r.espresso, 'Missing espresso dark text token in src/theme/tokens.ts');
        assert(r.terracotta, 'Missing terracotta primary/expense token in src/theme/tokens.ts');
        assert(r.sage, 'Missing sage positive/income token in src/theme/tokens.ts');
        assert(r.sand, 'Missing warm sand/surfaceAlt token in src/theme/tokens.ts');
        assert(r.heroBg, 'Missing hero cocoa dark background token in src/theme/tokens.ts');
        const scan = scanLegacyColors(JSON.stringify(evaluation.flat), { includeRgb: false });
        assertEqual(scan.total, 0, `Legacy cool hexes found in tokens.ts: ${JSON.stringify(scan.matches)}`);
      },
    },
    {
      id: 'T1-F1-03',
      tier: 1,
      feature: 'F1',
      kind: 'static',
      description: 'Zero legacy cool slate/emerald/rose/indigo hexes across App.tsx, src/**, and app.json',
      fn: async () => {
        const files = await listProjectSourceFiles();
        const findings = [];
        for (const f of files) {
          const raw = await fs.readFile(f, 'utf8');
          const content = f.endsWith('.json') ? raw : raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
          const scan = scanLegacyColors(content);
          if (scan.total > 0) {
            findings.push({ file: path.relative(PROJECT_ROOT, f), matches: scan.matches });
          }
        }
        assertEqual(findings.length, 0, `Legacy cool colors detected in source: ${JSON.stringify(findings)}`);
      },
    },
    {
      id: 'T1-F1-04',
      tier: 1,
      feature: 'F1',
      kind: 'static',
      requiresBundle: true,
      description: 'Compiled Expo Web bundle contains warm earth-tone tokens and zero legacy cool hex/RGB leaks',
      fn: async (ctx) => {
        assert(ctx.webBundle?.bundleCode, 'Expo Web bundle not available');
        const scan = scanLegacyColors(ctx.webBundle.bundleCode, { includeRgb: true });
        assertEqual(scan.total, 0, `Legacy cool colors in compiled bundle: ${JSON.stringify(scan.matches)}`);
        const upper = ctx.webBundle.bundleCode.toUpperCase();
        assert(
          upper.includes('#FAF6F0') && upper.includes('#C86446') && upper.includes('#5B8260'),
          'Expected warm palette hexes (#FAF6F0, #C86446, #5B8260) in compiled Expo Web bundle'
        );
      },
    },
    {
      id: 'T1-F1-05',
      tier: 1,
      feature: 'F1',
      kind: 'static',
      description: 'Programmatic WCAG 2.1 contrast check passes on src/theme/tokens.ts color pairings',
      fn: async () => {
        const tokensMod = await importTsFresh('src/theme/tokens.ts');
        const evaluation = evaluatePaletteContracts(tokensMod);
        const failed = evaluation.pairs.filter((p) => !p.pass);
        assertEqual(
          failed.length,
          0,
          `WCAG contrast failures in tokens.ts: ${JSON.stringify(failed)}`
        );
      },
    },
    {
      id: 'T1-F1-06',
      tier: 1,
      feature: 'F1',
      kind: 'browser',
      description: 'Live rendered DOM uses warm cream root, warm cocoa hero card, and 100% WCAG compliant text',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await cdp.navigate(webUrl);
        await cdp.clearStorage();
        await cdp.reload();
        await cdp.waitForText('Buat Akun');

        const onboardingAudit = await cdp.getDomAudit();
        const rootRgb = parseColor(onboardingAudit.bodyBg);
        assert(rootRgb && rootRgb.r >= 240 && rootRgb.g >= 235 && rootRgb.b >= 220 && rootRgb.r >= rootRgb.b,
          `Expected warm cream root background, got ${onboardingAudit.bodyBg}`);
        assertEqual(
          onboardingAudit.contrastFailures.length,
          0,
          `Onboarding WCAG failures: ${JSON.stringify(onboardingAudit.contrastFailures)}`
        );

        await createCoupleInBrowser(cdp, webUrl, 'Rumah Hangat', 'Raka');
        await cdp.waitForText('Saldo Bersih');
        const dashAudit = await cdp.getDomAudit();
        assertEqual(
          dashAudit.contrastFailures.length,
          0,
          `Dashboard WCAG failures: ${JSON.stringify(dashAudit.contrastFailures)}`
        );

        // Verify hero card uses warm cocoa (dark warm brown, not legacy slate #0F172A)
        const heroBg = await cdp.evalFn(() => {
          const all = Array.from(document.querySelectorAll('*'));
          for (const el of all) {
            if ((el.innerText || '').includes('Saldo Bersih')) {
              let cur = el;
              while (cur) {
                const bg = getComputedStyle(cur).backgroundColor;
                const m = bg.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
                if (m && (m[4] === undefined || Number(m[4]) > 0.9)) {
                  if (Number(m[1]) < 100 && Number(m[2]) < 100 && Number(m[3]) < 100) {
                    return bg;
                  }
                }
                cur = cur.parentElement;
              }
            }
          }
          return null;
        });
        assert(heroBg, 'Could not find dark hero card background');
        const heroRgb = parseColor(heroBg);
        assert(
          heroRgb && heroRgb.r > heroRgb.b && !(heroRgb.r === 15 && heroRgb.g === 23 && heroRgb.b === 42),
          `Hero card background should be warm cocoa (R > B), got ${heroBg}`
        );
      },
    },

    // =========================================================================
    // F2 — Quick Entry Shortcuts & Presets (6 Tests)
    // =========================================================================
    {
      id: 'T1-F2-01',
      tier: 1,
      feature: 'F2',
      kind: 'browser',
      description: 'Quick shortcuts (+ Pemasukan, - Pengeluaran, + Catat) and IDR amount presets render on Dashboard/QuickEntrySheet',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleInBrowser(cdp, webUrl, 'Pasangan Cepat', 'Raka');
        const body = await cdp.getBodyText();
        assert(body.includes('+ Pemasukan'), 'Dashboard missing "+ Pemasukan" quick shortcut');
        assert(body.includes('- Pengeluaran'), 'Dashboard missing "- Pengeluaran" quick shortcut');
        assert(body.includes('+ Catat'), 'Header missing "+ Catat" quick shortcut');

        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText(/Simpan/);
        const modalBody = await cdp.getBodyText();
        for (const preset of ['25rb', '50rb', '100rb', '250rb', '500rb', '1jt']) {
          assert(modalBody.includes(preset), `QuickEntrySheet missing preset "${preset}"`);
        }
      },
    },
    {
      id: 'T1-F2-02',
      tier: 1,
      feature: 'F2',
      kind: 'browser',
      description: '- Pengeluaran quick shortcut + preset amount updates Dashboard monthly expense & net balance',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleInBrowser(cdp, webUrl, 'Hemat Berdua', 'Raka');
        cdp.clearTrackedRequests();

        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('100rb');
        await cdp.clickByText('100rb', { exact: true, last: true });
        await cdp.clickByText('Simpan', { exact: true, last: true });

        await cdp.waitForText('Rp 100.000');
        const postTx = cdp.requests.find((r) => r.method === 'POST' && r.url.includes('/api/transactions'));
        assert(postTx, 'Expected POST /api/transactions request');
        const parsed = JSON.parse(postTx.postData || '{}');
        assertEqual(parsed.type, 'expense', 'Shortcut - Pengeluaran must send type=expense');
        assertEqual(parsed.amount, 100000, 'Preset 100rb must send amount=100000');
      },
    },
    {
      id: 'T1-F2-03',
      tier: 1,
      feature: 'F2',
      kind: 'browser',
      description: '+ Pemasukan quick shortcut + preset amount updates Dashboard monthly income & net balance',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleInBrowser(cdp, webUrl, 'Gajian Berdua', 'Raka');
        cdp.clearTrackedRequests();

        await cdp.clickByText('+ Pemasukan');
        await cdp.waitForText('500rb');
        await cdp.clickByText('500rb', { exact: true, last: true });
        await cdp.clickByText('Simpan', { exact: true, last: true });

        await cdp.waitForText('Rp 500.000');
        const postTx = cdp.requests.find((r) => r.method === 'POST' && r.url.includes('/api/transactions'));
        assert(postTx, 'Expected POST /api/transactions request');
        const parsed = JSON.parse(postTx.postData || '{}');
        assertEqual(parsed.type, 'income', 'Shortcut + Pemasukan must send type=income');
        assertEqual(parsed.amount, 500000, 'Preset 500rb must send amount=500000');
      },
    },
    {
      id: 'T1-F2-04',
      tier: 1,
      feature: 'F2',
      kind: 'browser',
      description: 'Quick category chip selection persists transaction under chosen category in Transaksi tab',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleInBrowser(cdp, webUrl, 'Kategori Cepat', 'Raka');
        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('50rb');
        await cdp.clickByText(/Rumah Tangga/, { last: true });
        await cdp.clickByText('50rb', { exact: true, last: true });
        await cdp.fillInput(/Catatan|Catering/i, 'Belanja dapur');
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');
        await cdp.waitForText('Rp 50.000');

        await cdp.clickByText('Transaksi', { exact: true, last: true });
        await cdp.waitForText('Belanja dapur');
        const body = await cdp.getBodyText();
        assert(body.includes('Rumah Tangga'), 'Transaksi list missing selected category "Rumah Tangga"');
        assert(body.includes('Rp 50.000'), 'Transaksi list missing formatted amount Rp 50.000');
      },
    },
    {
      id: 'T1-F2-05',
      tier: 1,
      feature: 'F2',
      kind: 'browser',
      description: 'Cross-platform date selector (Kemarin / day stepper) updates occurredAt by -1 day',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleInBrowser(cdp, webUrl, 'Tanggal Cepat', 'Raka');
        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('25rb');
        await cdp.clickByText('25rb', { exact: true, last: true });

        cdp.clearTrackedRequests();
        await cdp.clickByText(/Kemarin/i, { last: true });
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForText(/Ringkas/);

        const deadline = Date.now() + 4000;
        let postTx = null;
        while (Date.now() < deadline) {
          postTx = cdp.requests.find((r) => r.method === 'POST' && r.url.includes('/api/transactions'));
          if (postTx) break;
          await new Promise((r) => setTimeout(r, 80));
        }
        assert(postTx, 'Expected POST /api/transactions request after Kemarin shortcut');
        const payload = JSON.parse(postTx.postData || '{}');
        assert(payload.occurredAt, 'Expected occurredAt in POST /api/transactions payload');

        const sentDate = new Date(payload.occurredAt);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        assertEqual(
          `${sentDate.getFullYear()}-${sentDate.getMonth()}-${sentDate.getDate()}`,
          `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`,
          `Expected Kemarin to set local date to yesterday (${yesterday.toDateString()}), got ${sentDate.toDateString()}`
        );
      },
    },
    {
      id: 'T1-F2-06',
      tier: 1,
      feature: 'F2',
      kind: 'static',
      description: 'src/utils/format.ts deterministically formats and parses Indonesian Rupiah amounts',
      fn: async () => {
        const fmt = await importTsFresh('src/utils/format.ts');
        assertEqual(typeof fmt.formatRp, 'function', 'formatRp function must be exported');
        assertEqual(typeof fmt.parseIdrInput, 'function', 'parseIdrInput function must be exported');
        assertEqual(fmt.formatRp(1500000), 'Rp 1.500.000', 'formatRp(1500000)');
        assertEqual(fmt.formatRp(0), 'Rp 0', 'formatRp(0)');
        assertEqual(fmt.parseIdrInput('1.500.000'), 1500000, 'parseIdrInput dotted IDR');
        assertEqual(fmt.parseIdrInput('Rp 250.000'), 250000, 'parseIdrInput prefixed IDR');
      },
    },

    // =========================================================================
    // F3 — Monthly Period Selector & Filtering (6 API Tests)
    // =========================================================================
    {
      id: 'T1-F3-01',
      tier: 1,
      feature: 'F3',
      kind: 'api',
      description: 'GET /api/transactions?month=2026-11&tzOffset=0 filters to selected month sorted occurredAt DESC',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 100000, occurredAt: '2026-10-10T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 200000, occurredAt: '2026-10-20T10:00:00.000Z' });
        const nov1 = await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 300000, occurredAt: '2026-11-05T10:00:00.000Z' });
        const nov2 = await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'income', amount: 400000, occurredAt: '2026-11-15T10:00:00.000Z' });

        const res = await apiRequest(ctx.apiUrl, '/api/transactions?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        assert(Array.isArray(res.data?.transactions), 'GET /api/transactions must return { transactions: [...] }');
        assertEqual(res.data.transactions.length, 2, 'Expected exactly 2 transactions in 2026-11');
        assertEqual(res.data.transactions[0].id, nov2.id, 'Expected latest occurredAt first (DESC)');
        assertEqual(res.data.transactions[1].id, nov1.id, 'Expected earlier occurredAt second');
      },
    },
    {
      id: 'T1-F3-02',
      tier: 1,
      feature: 'F3',
      kind: 'api',
      description: 'GET /api/transactions without month returns all-time transactions across months',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 100000, occurredAt: '2026-10-10T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 200000, occurredAt: '2026-10-20T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 300000, occurredAt: '2026-11-05T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'income', amount: 400000, occurredAt: '2026-11-15T10:00:00.000Z' });

        const res = await apiRequest(ctx.apiUrl, '/api/transactions', { token: tokenA });
        assertStatus(res, 200);
        assert(Array.isArray(res.data?.transactions), 'Expected { transactions: [...] }');
        assertEqual(res.data.transactions.length, 4, 'Expected all 4 transactions when month omitted');
      },
    },
    {
      id: 'T1-F3-03',
      tier: 1,
      feature: 'F3',
      kind: 'api',
      description: 'GET /api/transactions supports compound filters (month + partnerId + type + categoryId + accountId)',
      fn: async (ctx) => {
        const { tokenA, tokenB, partnerB, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        const c1 = categories[0].id;
        const c2 = categories[1].id;
        const acc1 = await createAccount(ctx.apiUrl, tokenA, { name: 'Dompet 1', accountType: 'cash', isShared: true, initialBalance: 1000000 });
        const acc2 = await createAccount(ctx.apiUrl, tokenA, { name: 'Dompet 2', accountType: 'bank', isShared: true, initialBalance: 1000000 });

        // Matching tx
        const target = await createTx(ctx.apiUrl, tokenB, { categoryId: c1, accountId: acc1.id, type: 'expense', amount: 111000, occurredAt: '2026-11-12T10:00:00.000Z' });
        // Non-matching variations
        await createTx(ctx.apiUrl, tokenA, { categoryId: c1, accountId: acc1.id, type: 'expense', amount: 222000, occurredAt: '2026-11-12T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: c1, accountId: acc1.id, type: 'income', amount: 333000, occurredAt: '2026-11-12T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: c2, accountId: acc1.id, type: 'expense', amount: 444000, occurredAt: '2026-11-12T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: c1, accountId: acc2.id, type: 'expense', amount: 555000, occurredAt: '2026-11-12T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: c1, accountId: acc1.id, type: 'expense', amount: 666000, occurredAt: '2026-10-12T10:00:00.000Z' });

        const q = `/api/transactions?month=2026-11&partnerId=${partnerB.id}&type=expense&categoryId=${c1}&accountId=${acc1.id}&tzOffset=0`;
        const res = await apiRequest(ctx.apiUrl, q, { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data?.transactions?.length, 1, 'Expected exactly 1 transaction matching all 5 predicates');
        assertEqual(res.data.transactions[0].id, target.id);
      },
    },
    {
      id: 'T1-F3-04',
      tier: 1,
      feature: 'F3',
      kind: 'api',
      description: 'GET /api/summary?month=2026-11&tzOffset=0 scopes totals to selected month',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'income', amount: 10000000, occurredAt: '2026-10-15T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'income', amount: 3000000, occurredAt: '2026-11-05T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 1250000, occurredAt: '2026-11-10T10:00:00.000Z' });

        const res = await apiRequest(ctx.apiUrl, '/api/summary?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data.month, '2026-11');
        assertEqual(res.data.totalIncome, 3000000);
        assertEqual(res.data.totalExpense, 1250000);
        assertEqual(res.data.netBalance, 1750000);
      },
    },
    {
      id: 'T1-F3-05',
      tier: 1,
      feature: 'F3',
      kind: 'api',
      description: 'GET /api/summary without month preserves backward-compatible all-time totals',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'income', amount: 10000000, occurredAt: '2026-10-15T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'income', amount: 3000000, occurredAt: '2026-11-05T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 1250000, occurredAt: '2026-11-10T10:00:00.000Z' });

        const res = await apiRequest(ctx.apiUrl, '/api/summary', { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data.totalIncome, 13000000);
        assertEqual(res.data.totalExpense, 1250000);
        assertEqual(res.data.netBalance, 11750000);
      },
    },
    {
      id: 'T1-F3-06',
      tier: 1,
      feature: 'F3',
      kind: 'api',
      description: 'Monthly filtering synchronizes across /transactions, /summary, /analytics, and /budgets',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 2000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 900000, occurredAt: '2026-10-15T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'income', amount: 5000000, occurredAt: '2026-11-05T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 750000, occurredAt: '2026-11-08T10:00:00.000Z' });

        const qs = '?month=2026-11&tzOffset=420';
        const [txRes, sumRes, anaRes, bdgRes] = await Promise.all([
          apiRequest(ctx.apiUrl, `/api/transactions${qs}`, { token: tokenA }),
          apiRequest(ctx.apiUrl, `/api/summary${qs}`, { token: tokenA }),
          apiRequest(ctx.apiUrl, `/api/analytics${qs}`, { token: tokenA }),
          apiRequest(ctx.apiUrl, `/api/budgets${qs}`, { token: tokenA }),
        ]);
        assertStatus(txRes, 200);
        assertStatus(sumRes, 200);
        assertStatus(anaRes, 200);
        assertStatus(bdgRes, 200);

        assertEqual(txRes.data.transactions.length, 2);
        assertEqual(sumRes.data.totalIncome, 5000000);
        assertEqual(sumRes.data.totalExpense, 750000);
        assertEqual(anaRes.data.totals.totalIncome, sumRes.data.totalIncome);
        assertEqual(anaRes.data.totals.totalExpense, sumRes.data.totalExpense);
        assertEqual(anaRes.data.totals.netBalance, sumRes.data.netBalance);
        assertEqual(bdgRes.data.totalSpent, 750000);
      },
    },

    // =========================================================================
    // F4 — Analytics (6 API Tests)
    // =========================================================================
    {
      id: 'T1-F4-01',
      tier: 1,
      feature: 'F4',
      kind: 'api',
      description: 'GET /api/analytics returns accurate monthly totals, savingsRate, and transactionCount',
      fn: async (ctx) => {
        const { tokenA, tokenB, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'income', amount: 10000000, occurredAt: '2026-11-02T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: categories[1].id, type: 'expense', amount: 2500000, occurredAt: '2026-11-03T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: categories[2].id, type: 'expense', amount: 1500000, occurredAt: '2026-11-04T10:00:00.000Z' });

        const res = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data.month, '2026-11');
        assertEqual(res.data.totals?.totalIncome, 10000000);
        assertEqual(res.data.totals?.totalExpense, 4000000);
        assertEqual(res.data.totals?.netBalance, 6000000);
        assertEqual(res.data.totals?.savingsRate, 60);
        assertEqual(res.data.totals?.transactionCount, 3);
      },
    },
    {
      id: 'T1-F4-02',
      tier: 1,
      feature: 'F4',
      kind: 'api',
      description: 'GET /api/analytics category breakdown computes expense, income, and expensePercent summing to 100',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const cat1 = categories[0].id;
        const cat2 = categories[1].id;
        await createTx(ctx.apiUrl, tokenA, { categoryId: cat1, type: 'expense', amount: 3000000, occurredAt: '2026-11-03T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: cat2, type: 'expense', amount: 1000000, occurredAt: '2026-11-04T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: cat1, type: 'income', amount: 5000000, occurredAt: '2026-11-05T10:00:00.000Z' });

        const res = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        const byCat = res.data.byCategory;
        assert(Array.isArray(byCat), 'Expected byCategory array');
        const c1 = byCat.find((c) => c.categoryId === cat1);
        const c2 = byCat.find((c) => c.categoryId === cat2);
        assert(c1 && c2, 'Missing expected categories in analytics.byCategory');
        assertEqual(c1.expense, 3000000);
        assertEqual(c1.income, 5000000);
        assertEqual(c1.expensePercent, 75);
        assertEqual(c2.expense, 1000000);
        assertEqual(c2.expensePercent, 25);
        const sumPct = byCat.reduce((acc, c) => acc + c.expensePercent, 0);
        assertEqual(sumPct, 100, 'Sum of expensePercent across categories must equal 100');
      },
    },
    {
      id: 'T1-F4-03',
      tier: 1,
      feature: 'F4',
      kind: 'api',
      description: 'GET /api/analytics partner contribution breakdown computes incomePercent & expensePercent',
      fn: async (ctx) => {
        const { tokenA, tokenB, partnerA, partnerB, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        const catId = categories[0].id;
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'income', amount: 6000000, occurredAt: '2026-11-01T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 1000000, occurredAt: '2026-11-02T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: catId, type: 'income', amount: 4000000, occurredAt: '2026-11-03T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: catId, type: 'expense', amount: 3000000, occurredAt: '2026-11-04T10:00:00.000Z' });

        const res = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data.byPartner?.length, 2);
        const pA = res.data.byPartner.find((p) => p.partnerId === partnerA.id);
        const pB = res.data.byPartner.find((p) => p.partnerId === partnerB.id);
        assert(pA && pB, 'Missing partner entries in analytics.byPartner');
        assertEqual(pA.incomePercent, 60);
        assertEqual(pA.expensePercent, 25);
        assertEqual(pA.net, 5000000);
        assertEqual(pB.incomePercent, 40);
        assertEqual(pB.expensePercent, 75);
        assertEqual(pB.net, 1000000);
      },
    },
    {
      id: 'T1-F4-04',
      tier: 1,
      feature: 'F4',
      kind: 'api',
      description: 'GET /api/analytics accountsOverview reflects live personal + shared wallet balances',
      fn: async (ctx) => {
        const { tokenA, partnerA } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        await createAccount(ctx.apiUrl, tokenA, { name: 'Tabungan Bersama', accountType: 'shared_savings', isShared: true, initialBalance: 5000000 });
        await createAccount(ctx.apiUrl, tokenA, { name: 'Cash A', accountType: 'cash', isShared: false, ownerPartnerId: partnerA.id, initialBalance: 1200000 });
        await createAccount(ctx.apiUrl, tokenA, { name: 'E-Wallet A', accountType: 'ewallet', isShared: false, ownerPartnerId: partnerA.id, initialBalance: 800000 });

        const res = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data.accountsOverview?.totalBalance, 7000000);
        assertEqual(res.data.accountsOverview?.sharedBalance, 5000000);
        assertEqual(res.data.accountsOverview?.personalBalance, 2000000);
        assertEqual(res.data.accountsOverview?.accountsCount, 3);
      },
    },
    {
      id: 'T1-F4-05',
      tier: 1,
      feature: 'F4',
      kind: 'api',
      description: 'GET /api/analytics totals and per-partner metrics match /api/summary?month=...',
      fn: async (ctx) => {
        const { tokenA, tokenB, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'income', amount: 4500000, occurredAt: '2026-11-05T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: categories[1].id, type: 'expense', amount: 1200000, occurredAt: '2026-11-06T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[2].id, type: 'expense', amount: 300000, occurredAt: '2026-11-07T10:00:00.000Z' });

        const [sumRes, anaRes] = await Promise.all([
          apiRequest(ctx.apiUrl, '/api/summary?month=2026-11&tzOffset=420', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=420', { token: tokenA }),
        ]);
        assertStatus(sumRes, 200);
        assertStatus(anaRes, 200);
        assertEqual(anaRes.data.totals.totalIncome, sumRes.data.totalIncome);
        assertEqual(anaRes.data.totals.totalExpense, sumRes.data.totalExpense);
        assertEqual(anaRes.data.totals.netBalance, sumRes.data.netBalance);
        for (const sp of sumRes.data.byPartner) {
          const ap = anaRes.data.byPartner.find((x) => x.partnerId === sp.partnerId);
          assert(ap, `Missing partner ${sp.partnerId} in analytics`);
          assertEqual(ap.income, sp.income);
          assertEqual(ap.expense, sp.expense);
          assertEqual(ap.net, sp.net);
        }
      },
    },
    {
      id: 'T1-F4-06',
      tier: 1,
      feature: 'F4',
      kind: 'api',
      description: 'GET /api/analytics reflects transaction PATCH and DELETE immediately',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const tx = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'expense', amount: 1000000, occurredAt: '2026-11-10T10:00:00.000Z' });

        const a1 = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(a1, 200);
        assertEqual(a1.data.totals.totalExpense, 1000000);

        const patchRes = await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, { method: 'PATCH', token: tokenA, body: { amount: 500000 } });
        assertStatus(patchRes, 200);
        const a2 = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(a2, 200);
        assertEqual(a2.data.totals.totalExpense, 500000);

        const delRes = await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, { method: 'DELETE', token: tokenA });
        assertStatus(delRes, 200);
        const a3 = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(a3, 200);
        assertEqual(a3.data.totals.totalExpense, 0);
        assertEqual(a3.data.totals.transactionCount, 0);
      },
    },

    // =========================================================================
    // F5 — Accounts / Wallets & Balance Sync (7 API Tests)
    // =========================================================================
    {
      id: 'T1-F5-01',
      tier: 1,
      feature: 'F5',
      kind: 'api',
      description: 'POST /api/accounts creates shared & personal accounts with accurate initial balance',
      fn: async (ctx) => {
        const { tokenA, partnerA } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        const shared = await createAccount(ctx.apiUrl, tokenA, {
          name: 'Tabungan Nikah',
          accountType: 'shared_savings',
          isShared: true,
          initialBalance: 5000000,
        });
        assertEqual(shared.balance, 5000000);
        assertEqual(shared.isShared, true);
        assertEqual(shared.ownerPartnerId, null);

        const personal = await createAccount(ctx.apiUrl, tokenA, {
          name: 'GoPay Raka',
          accountType: 'ewallet',
          isShared: false,
          ownerPartnerId: partnerA.id,
          initialBalance: 750000,
        });
        assertEqual(personal.balance, 750000);
        assertEqual(personal.isShared, false);
        assertEqual(personal.ownerPartnerId, partnerA.id);
      },
    },
    {
      id: 'T1-F5-02',
      tier: 1,
      feature: 'F5',
      kind: 'api',
      description: 'GET /api/accounts aggregates totalBalance, sharedBalance, and personalBalance',
      fn: async (ctx) => {
        const { tokenA, partnerA } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        await createAccount(ctx.apiUrl, tokenA, { name: 'Tabungan Bersama', accountType: 'shared_savings', isShared: true, initialBalance: 5000000 });
        await createAccount(ctx.apiUrl, tokenA, { name: 'GoPay Raka', accountType: 'ewallet', isShared: false, ownerPartnerId: partnerA.id, initialBalance: 750000 });

        const res = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertStatus(res, 200);
        assertEqual(res.data.accounts?.length, 2);
        assertEqual(res.data.totals?.sharedBalance, 5000000);
        assertEqual(res.data.totals?.personalBalance, 750000);
        assertEqual(res.data.totals?.totalBalance, 5750000);
      },
    },
    {
      id: 'T1-F5-03',
      tier: 1,
      feature: 'F5',
      kind: 'api',
      description: 'POST /api/transactions linked to accountId credits income & debits expense atomically',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const acc = await createAccount(ctx.apiUrl, tokenA, { name: 'Bank BCA', accountType: 'bank', isShared: true, initialBalance: 1000000 });

        const txIn = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: acc.id, type: 'income', amount: 400000 });
        assertEqual(txIn.accountId, acc.id);
        assertEqual(txIn.accountName, 'Bank BCA');
        assert(typeof txIn.accountIcon === 'string' && txIn.accountIcon.length > 0, 'Expected accountIcon on tx');

        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: acc.id, type: 'expense', amount: 150000 });
        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertStatus(accRes, 200);
        assertEqual(accRes.data.accounts[0].balance, 1250000);
      },
    },
    {
      id: 'T1-F5-04',
      tier: 1,
      feature: 'F5',
      kind: 'api',
      description: 'PATCH /api/transactions/:id on same account (A -> A) adjusts balance by delta',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const acc = await createAccount(ctx.apiUrl, tokenA, { name: 'Dompet Tunai', accountType: 'cash', isShared: true, initialBalance: 1000000 });
        const tx = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: acc.id, type: 'expense', amount: 150000 });

        const patchRes = await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, {
          method: 'PATCH',
          token: tokenA,
          body: { amount: 250000, note: 'Revisi harga' },
        });
        assertStatus(patchRes, 200);
        assertEqual(patchRes.data.transaction?.amount, 250000);
        assertEqual(patchRes.data.transaction?.note, 'Revisi harga');

        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertStatus(accRes, 200);
        assertEqual(accRes.data.accounts[0].balance, 750000);
      },
    },
    {
      id: 'T1-F5-05',
      tier: 1,
      feature: 'F5',
      kind: 'api',
      description: 'DELETE /api/transactions/:id reverses account balance and returns { ok: true, id }',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const acc = await createAccount(ctx.apiUrl, tokenA, { name: 'Dompet', accountType: 'cash', isShared: true, initialBalance: 1000000 });
        const tx = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: acc.id, type: 'expense', amount: 250000 });

        const delRes = await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, { method: 'DELETE', token: tokenA });
        assertStatus(delRes, 200);
        assertEqual(delRes.data?.ok, true);
        assertEqual(delRes.data?.id, tx.id);

        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertEqual(accRes.data.accounts[0].balance, 1000000);
        const listRes = await apiRequest(ctx.apiUrl, '/api/transactions', { token: tokenA });
        assertEqual(listRes.data.transactions.length, 0);
      },
    },
    {
      id: 'T1-F5-06',
      tier: 1,
      feature: 'F5',
      kind: 'api',
      description: 'PATCH /api/accounts/:id updates metadata, isShared, totals, and shifts balance by (newInitial - oldInitial)',
      fn: async (ctx) => {
        const { tokenA, partnerA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const acc = await createAccount(ctx.apiUrl, tokenA, { name: 'BCA Lama', accountType: 'bank', isShared: true, initialBalance: 1000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: acc.id, type: 'expense', amount: 200000 });

        const patchRes = await apiRequest(ctx.apiUrl, `/api/accounts/${acc.id}`, {
          method: 'PATCH',
          token: tokenA,
          body: { name: 'BCA Utama', initialBalance: 1500000 },
        });
        assertStatus(patchRes, 200);
        assertEqual(patchRes.data.account?.name, 'BCA Utama');
        assertEqual(patchRes.data.account?.initialBalance, 1500000);
        assertEqual(patchRes.data.account?.balance, 1300000);

        const sharedTotals = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertStatus(sharedTotals, 200);
        assertEqual(sharedTotals.data.totals?.sharedBalance, 1300000);
        assertEqual(sharedTotals.data.totals?.personalBalance, 0);
        assertEqual(sharedTotals.data.totals?.totalBalance, 1300000);

        const toggleRes = await apiRequest(ctx.apiUrl, `/api/accounts/${acc.id}`, {
          method: 'PATCH',
          token: tokenA,
          body: { isShared: false, ownerPartnerId: partnerA.id },
        });
        assertStatus(toggleRes, 200);
        assertEqual(toggleRes.data.account?.isShared, false);
        assertEqual(toggleRes.data.account?.ownerPartnerId, partnerA.id);

        const personalTotals = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertStatus(personalTotals, 200);
        assertEqual(personalTotals.data.totals?.sharedBalance, 0);
        assertEqual(personalTotals.data.totals?.personalBalance, 1300000);
        assertEqual(personalTotals.data.totals?.totalBalance, 1300000);
      },
    },
    {
      id: 'T1-F5-07',
      tier: 1,
      feature: 'F5',
      kind: 'api',
      description: 'DELETE /api/accounts/:id preserves linked transactions with accountId: null (ON DELETE SET NULL)',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const acc = await createAccount(ctx.apiUrl, tokenA, { name: 'Dompet Sementara', accountType: 'other', isShared: true, initialBalance: 500000 });
        const tx = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: acc.id, type: 'expense', amount: 100000, note: 'Tetap ada' });

        const delRes = await apiRequest(ctx.apiUrl, `/api/accounts/${acc.id}`, { method: 'DELETE', token: tokenA });
        assertStatus(delRes, 200);
        assertEqual(delRes.data?.ok, true);
        assertEqual(delRes.data?.id, acc.id);

        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertEqual(accRes.data.accounts.length, 0);

        const txRes = await apiRequest(ctx.apiUrl, '/api/transactions', { token: tokenA });
        assertStatus(txRes, 200);
        assertEqual(txRes.data.transactions.length, 1);
        assertEqual(txRes.data.transactions[0].id, tx.id);
        assertEqual(txRes.data.transactions[0].accountId, null);
        assertEqual(txRes.data.transactions[0].accountName, null);
        assertEqual(txRes.data.transactions[0].accountIcon, null);
      },
    },

    // =========================================================================
    // F6 — Budgets (6 API Tests)
    // =========================================================================
    {
      id: 'T1-F6-01',
      tier: 1,
      feature: 'F6',
      kind: 'api',
      description: 'POST /api/budgets creates a monthly category budget with zero initial spent',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        const budget = await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 2000000 }, 'POST');
        assertEqual(budget.month, '2026-11');
        assertEqual(budget.limitAmount, 2000000);
        assertEqual(budget.spent, 0);
        assertEqual(budget.remaining, 2000000);
        assertEqual(budget.progressPercent, 0);
        assertEqual(budget.isOverBudget, false);
      },
    },
    {
      id: 'T1-F6-02',
      tier: 1,
      feature: 'F6',
      kind: 'api',
      description: 'PUT /api/budgets upserts existing (coupleId, categoryId, month) without duplicating',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        const created = await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 2000000 }, 'POST');
        const updated = await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 3000000 }, 'PUT');
        assertEqual(updated.id, created.id);
        assertEqual(updated.limitAmount, 3000000);
        assertEqual(updated.remaining, 3000000);

        const list = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11', { token: tokenA });
        assertStatus(list, 200);
        assertEqual(list.data.budgets.length, 1);
      },
    },
    {
      id: 'T1-F6-03',
      tier: 1,
      feature: 'F6',
      kind: 'api',
      description: 'POST /api/budgets upserts existing (coupleId, categoryId, month) rather than creating duplicates',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 2000000 }, 'POST');
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 2500000 }, 'POST');

        const list = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11', { token: tokenA });
        assertStatus(list, 200);
        assertEqual(list.data.budgets.length, 1);
        assertEqual(list.data.budgets[0].limitAmount, 2500000);
      },
    },
    {
      id: 'T1-F6-04',
      tier: 1,
      feature: 'F6',
      kind: 'api',
      description: 'GET /api/budgets aggregates spent, remaining, progressPercent across both partners',
      fn: async (ctx) => {
        const { tokenA, tokenB, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        const catId = categories[0].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 2000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 600000, occurredAt: '2026-11-05T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: catId, type: 'expense', amount: 400000, occurredAt: '2026-11-06T10:00:00.000Z' });

        const list = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(list, 200);
        assertEqual(list.data.totalLimit, 2000000);
        assertEqual(list.data.totalSpent, 1000000);
        assertEqual(list.data.totalRemaining, 1000000);
        const b = list.data.budgets[0];
        assertEqual(b.spent, 1000000);
        assertEqual(b.remaining, 1000000);
        assertEqual(b.progressPercent, 50);
        assertEqual(b.isOverBudget, false);
      },
    },
    {
      id: 'T1-F6-05',
      tier: 1,
      feature: 'F6',
      kind: 'api',
      description: 'PATCH /api/budgets/:id updates limitAmount and flips isOverBudget when spent > limit',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        const bdg = await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 2000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 1000000, occurredAt: '2026-11-05T10:00:00.000Z' });

        const patchRes = await apiRequest(ctx.apiUrl, `/api/budgets/${bdg.id}?tzOffset=0`, {
          method: 'PATCH',
          token: tokenA,
          body: { limitAmount: 800000 },
        });
        assertStatus(patchRes, 200);
        const updated = patchRes.data.budget;
        assertEqual(updated.limitAmount, 800000);
        assertEqual(updated.spent, 1000000);
        assertEqual(updated.remaining, -200000);
        assertEqual(updated.progressPercent, 125);
        assertEqual(updated.isOverBudget, true);
      },
    },
    {
      id: 'T1-F6-06',
      tier: 1,
      feature: 'F6',
      kind: 'api',
      description: 'DELETE /api/budgets/:id deletes budget without affecting transactions or categories',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        const bdg = await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 2000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 500000, occurredAt: '2026-11-05T10:00:00.000Z' });

        const delRes = await apiRequest(ctx.apiUrl, `/api/budgets/${bdg.id}`, { method: 'DELETE', token: tokenA });
        assertStatus(delRes, 200);
        assertEqual(delRes.data?.ok, true);
        assertEqual(delRes.data?.id, bdg.id);

        const [bdgRes, txRes, catRes] = await Promise.all([
          apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/transactions', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/categories', { token: tokenA }),
        ]);
        assertEqual(bdgRes.data.budgets.length, 0);
        assertEqual(bdgRes.data.totalLimit, 0);
        assertEqual(txRes.data.transactions.length, 1);
        assert(catRes.data.length >= 4);
      },
    },

    // =========================================================================
    // F7 — Existing Pairing, Categories, Notes & Legacy Preservation (6 API Tests)
    // =========================================================================
    {
      id: 'T1-F7-01',
      tier: 1,
      feature: 'F7',
      kind: 'api',
      description: 'Couple creation generates 6-char invite code and Partner B joins cleanly (case-insensitive trim)',
      fn: async (ctx) => {
        const created = await createCouple(ctx.apiUrl, { coupleName: 'Raka & Nadia', partnerName: 'Raka' });
        assertMatch(created.couple.inviteCode, /^[A-F0-9]{6}$/, '6-char hex inviteCode');
        assertEqual(created.partner.roleLabel, 'Partner A');

        const joined = await joinCouple(ctx.apiUrl, `  ${created.couple.inviteCode.toLowerCase()}  `, { partnerName: 'Nadia' });
        assertEqual(joined.partner.roleLabel, 'Partner B');

        const cp = await apiRequest(ctx.apiUrl, '/api/couple', { token: joined.token });
        assertStatus(cp, 200);
        assertEqual(cp.data.partners?.length, 2);
      },
    },
    {
      id: 'T1-F7-02',
      tier: 1,
      feature: 'F7',
      kind: 'api',
      description: 'Preset and custom categories (Pos & Target) are preserved',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        assertEqual(categories.length, 4);
        assert(categories.every((c) => c.isDefault === true), 'Expected 4 default categories');
        const names = categories.map((c) => c.name).join(' ');
        for (const kw of ['Menikah', 'Traveling', 'Investasi', 'Rumah Tangga']) {
          assert(names.includes(kw), `Missing default category keyword ${kw}`);
        }

        const catRes = await apiRequest(ctx.apiUrl, '/api/categories', {
          method: 'POST',
          token: tokenA,
          body: { name: 'Dana Darurat', icon: '🛟', color: '#C86446', targetAmount: 20000000 },
        });
        assertStatus(catRes, 201);
        assertEqual(catRes.data.isDefault, false);
        assertEqual(catRes.data.targetAmount, 20000000);
      },
    },
    {
      id: 'T1-F7-03',
      tier: 1,
      feature: 'F7',
      kind: 'api',
      description: 'Shared notes (Catatan) preserve raw array response and pinned-first ordering',
      fn: async (ctx) => {
        const { tokenA, partnerA } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        await apiRequest(ctx.apiUrl, '/api/notes', {
          method: 'POST',
          token: tokenA,
          body: { title: 'Catatan Biasa', content: 'List belanja', isPinned: false },
        });
        const pinned = await apiRequest(ctx.apiUrl, '/api/notes', {
          method: 'POST',
          token: tokenA,
          body: { title: 'Catatan Penting', content: 'Jadwal KPR', isPinned: true },
        });
        assertStatus(pinned, 201);

        const list = await apiRequest(ctx.apiUrl, '/api/notes', { token: tokenA });
        assertStatus(list, 200);
        assert(Array.isArray(list.data), 'GET /api/notes must remain raw JSON array');
        assertEqual(list.data.length, 2);
        assertEqual(list.data[0].id, pinned.data.id, 'Pinned note must be ordered first');
        assertEqual(list.data[0].authorPartnerId, partnerA.id);
        assertEqual(list.data[0].authorName, partnerA.name);
      },
    },
    {
      id: 'T1-F7-04',
      tier: 1,
      feature: 'F7',
      kind: 'api',
      description: 'Legacy transaction creation without accountId works cleanly via LEFT JOIN',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const tx = await createTx(ctx.apiUrl, tokenA, {
          categoryId: categories[0].id,
          type: 'expense',
          amount: 120000,
          note: 'Legacy mode',
        });
        assertEqual(tx.accountId, null);
        assertEqual(tx.accountName, null);
        assertEqual(tx.accountIcon, null);

        const list = await apiRequest(ctx.apiUrl, '/api/transactions', { token: tokenA });
        assertStatus(list, 200);
        assertEqual(list.data.transactions.length, 1);
        assertEqual(list.data.transactions[0].accountId, null);
      },
    },
    {
      id: 'T1-F7-05',
      tier: 1,
      feature: 'F7',
      kind: 'api',
      description: 'Legacy accountId: null transactions aggregate accurately in Summary, Analytics, and Budgets',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 1000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 500000, occurredAt: '2026-11-10T10:00:00.000Z' });

        const [sumRes, anaRes, bdgRes] = await Promise.all([
          apiRequest(ctx.apiUrl, '/api/summary?month=2026-11&tzOffset=0', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=0', { token: tokenA }),
        ]);
        assertEqual(sumRes.data.totalExpense, 500000);
        assertEqual(anaRes.data.totals.totalExpense, 500000);
        assertEqual(bdgRes.data.budgets[0].spent, 500000);
      },
    },
    {
      id: 'T1-F7-06',
      tier: 1,
      feature: 'F7',
      kind: 'api',
      description: 'Editing and deleting legacy accountId: null transaction leaves account balances untouched',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const acc = await createAccount(ctx.apiUrl, tokenA, { name: 'BCA', accountType: 'bank', isShared: true, initialBalance: 1000000 });
        const tx = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'expense', amount: 100000 });

        await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, { method: 'PATCH', token: tokenA, body: { amount: 250000 } });
        let accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertEqual(accRes.data.accounts[0].balance, 1000000);

        await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, { method: 'DELETE', token: tokenA });
        accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertEqual(accRes.data.accounts[0].balance, 1000000);
      },
    },

    // =========================================================================
    // F8 — Mobile & Expo Web Compatibility (6 Tests)
    // =========================================================================
    {
      id: 'T1-F8-01',
      tier: 1,
      feature: 'F8',
      kind: 'static',
      description: 'Zero Alert.alert usage in App.tsx & src/**; FeedbackBanner and ConfirmModal components exist',
      fn: async () => {
        const files = (await listProjectSourceFiles()).filter((f) => /\.(ts|tsx)$/.test(f));
        const alertHits = [];
        for (const f of files) {
          const raw = await fs.readFile(f, 'utf8');
          const stripped = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
          if (
            /\bAlert\.alert\b/.test(stripped) ||
            /import\s*\{[^}]*\bAlert\b[^}]*\}\s*from\s+['"]react-native['"]/.test(stripped) ||
            /import[^;\n]*\bAlert\b[^\n]*from\s+['"]react-native['"]/.test(stripped)
          ) {
            alertHits.push(path.relative(PROJECT_ROOT, f));
          }
        }
        assertEqual(alertHits.length, 0, `Alert / Alert.alert found in: ${alertHits.join(', ')}`);
        await fs.access(path.join(PROJECT_ROOT, 'src/components/FeedbackBanner.tsx'));
        await fs.access(path.join(PROJECT_ROOT, 'src/components/ConfirmModal.tsx'));
      },
    },
    {
      id: 'T1-F8-02',
      tier: 1,
      feature: 'F8',
      kind: 'static',
      description: 'Zero web-incompatible native packages in package.json, App.tsx, and src/**',
      fn: async () => {
        const pkg = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        const banned = [
          '@react-native-community/datetimepicker',
          'react-native-svg',
          'victory-native',
          '@react-native-async-storage/async-storage',
          'expo-router',
        ];
        for (const dep of banned) {
          assert(!allDeps[dep], `Banned native-only package found in package.json: ${dep}`);
        }
        const files = (await listProjectSourceFiles()).filter((f) => /\.(ts|tsx)$/.test(f));
        for (const f of files) {
          const content = await fs.readFile(f, 'utf8');
          for (const dep of banned) {
            assert(!content.includes(dep), `Banned import ${dep} in ${path.relative(PROJECT_ROOT, f)}`);
          }
        }
      },
    },
    {
      id: 'T1-F8-03',
      tier: 1,
      feature: 'F8',
      kind: 'static',
      description: 'TypeScript strict check (npm run lint -> tsc --noEmit) exits 0 with zero errors',
      fn: async () => {
        const { stdout, stderr } = await execFileAsync('npm', ['run', 'lint'], {
          cwd: PROJECT_ROOT,
          timeout: 30000,
        });
        assert(!/error TS\d+/i.test(stdout + stderr), `tsc errors: ${stdout}\n${stderr}`);
      },
    },
    {
      id: 'T1-F8-04',
      tier: 1,
      feature: 'F8',
      kind: 'static',
      requiresBundle: true,
      description: 'Expo Web export succeeds and bundle contains all 5 tabs, Pos, Catatan, and Selama Sebulan',
      fn: async (ctx) => {
        assert(ctx.webBundle?.html && ctx.webBundle?.bundleCode, 'Expo Web export missing');
        assert(ctx.webBundle.html.includes('root'), 'index.html missing #root mount');
        const code = ctx.webBundle.bundleCode;
        for (const label of ['Ringkas', 'Transaksi', 'Analitik', 'Dompet', 'Anggaran', 'Catatan']) {
          assert(code.includes(label), `Compiled web bundle missing expected view/label "${label}"`);
        }
        assert(/Selama Sebulan/i.test(code), 'Compiled web bundle missing expected view/label "Selama Sebulan"');
        assert(/Pos\s*&\s*Target/.test(code), 'Compiled web bundle missing Pos & Target view');
      },
    },
    {
      id: 'T1-F8-05',
      tier: 1,
      feature: 'F8',
      kind: 'browser',
      description: 'Live Web boot & onboarding transition to 5-tab shell with zero runtime exceptions or console errors',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        cdp.clearTrackedErrors();
        await cdp.navigate(webUrl);
        await cdp.clearStorage();
        await cdp.reload();
        await cdp.waitForText('DUASAKU');

        const bootText = await cdp.getBodyText();
        assert(bootText.includes('Buat Akun') && bootText.includes('Masuk'));

        await createCoupleInBrowser(cdp, webUrl, 'Web Parity', 'Raka');
        const shellText = await cdp.getBodyText();
        for (const tab of ['Ringkas', 'Transaksi', 'Analitik', 'Dompet', 'Anggaran']) {
          assert(shellText.includes(tab), `5-tab shell missing tab "${tab}"`);
        }
        const errs = cdp.getErrors();
        assertEqual(errs.exceptions.length, 0, `Uncaught exceptions: ${JSON.stringify(errs.exceptions)}`);
        assertEqual(errs.consoleErrors.length, 0, `Console errors: ${JSON.stringify(errs.consoleErrors)}`);
      },
    },
    {
      id: 'T1-F8-06',
      tier: 1,
      feature: 'F8',
      kind: 'browser',
      description: 'Cross-platform FeedbackBanner (invalid submit) & ConfirmModal (cancel + confirm delete) work on Web',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await cdp.navigate(webUrl);
        await cdp.clearStorage();
        await cdp.reload();
        await cdp.waitForText('Buat Akun');
        await cdp.clickByText('Buat Akun', { exact: true });
        await cdp.waitForText('Lanjut Pilih Ruang');

        // Trigger invalid 1-char partner name -> inline error must display
        await cdp.fillInput('Contoh: Raka atau Nadia', 'A');
        await cdp.clickByText('Lanjut Pilih Ruang', { exact: true });
        await cdp.waitForText(/minimal 2|karakter|Validasi/i);

        // Create couple, add tx, test ConfirmModal cancel & confirm delete
        await createCoupleInBrowser(cdp, webUrl, 'Modal Parity', 'Raka');
        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('100rb');
        await cdp.clickByText('100rb', { exact: true, last: true });
        await cdp.fillInput(/Catatan|Catering/i, 'Uji ConfirmModal');
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');
        await cdp.waitForText('Rp 100.000');

        await cdp.clickByText('Transaksi', { exact: true, last: true });
        await cdp.waitForText('Uji ConfirmModal');
        await cdp.clickByText('Hapus', { exact: true });
        await cdp.waitForText(/Batal/);
        // Cancel must preserve transaction
        await cdp.clickByText('Batal', { exact: true, last: true });
        await new Promise((r) => setTimeout(r, 200));
        assert((await cdp.getBodyText()).includes('Uji ConfirmModal'), 'Cancel in ConfirmModal should preserve transaction');

        // Confirm must delete transaction
        await cdp.clickByText('Hapus', { exact: true });
        await cdp.waitForText(/Batal/);
        await cdp.clickByText(/^Hapus$|^Ya, Hapus$/i, { last: true });
        await cdp.waitForGoneText('Uji ConfirmModal');
      },
    },
  ];
}
