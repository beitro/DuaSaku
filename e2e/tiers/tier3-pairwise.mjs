// Tier 3 — Pairwise Cross-Feature Interaction Tests (14 tests: 8 API + 6 UI/Web)

import {
  apiRequest,
  assert,
  assertEqual,
  assertStatus,
  createAccount,
  createTx,
  saveBudget,
  setupCoupleContext,
} from '../lib/harness.mjs';
import { contrastRatio, parseColor } from '../lib/wcag.mjs';

async function createCoupleViaUi(cdp, webUrl, coupleName = 'Pasangan Pairwise', partnerName = 'Raka') {
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
  assert(token, 'Expected persisted auth token in localStorage');
  const catRes = await apiRequest(apiUrl, '/api/categories', { token });
  assertStatus(catRes, 200);
  return { token, categories: catRes.data };
}

export function getTier3Tests() {
  return [
    // =========================================================================
    // 8 API Pairwise Interaction Tests
    // =========================================================================
    {
      id: 'T3-API-01',
      tier: 3,
      feature: 'F3',
      features: ['F3', 'F5'],
      kind: 'api',
      description: 'F3 × F5: Month/tzOffset filtering isolates monthly transactions while account balance remains all-time cumulative',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const acc = await createAccount(ctx.apiUrl, tokenA, { name: 'Bank', accountType: 'bank', isShared: true, initialBalance: 1000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: acc.id, type: 'expense', amount: 150000, occurredAt: '2026-10-31T16:00:00.000Z' }); // Oct WIB
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: acc.id, type: 'income', amount: 500000, occurredAt: '2026-10-31T18:00:00.000Z' }); // Nov WIB

        const novTx = await apiRequest(ctx.apiUrl, `/api/transactions?month=2026-11&tzOffset=420&accountId=${acc.id}`, { token: tokenA });
        assertStatus(novTx, 200);
        assertEqual(novTx.data.transactions.length, 1);
        assertEqual(novTx.data.transactions[0].amount, 500000);

        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertEqual(accRes.data.accounts[0].balance, 1350000);
      },
    },
    {
      id: 'T3-API-02',
      tier: 3,
      feature: 'F3',
      features: ['F3', 'F6'],
      kind: 'api',
      description: 'F3 × F6: tzOffset shifts midnight boundary expenses accurately in /api/budgets spent',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 1000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 300000, occurredAt: '2026-10-31T18:00:00.000Z' });

        const wib = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=420', { token: tokenA });
        const utc = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=0', { token: tokenA });
        assertEqual(wib.data.budgets[0].spent, 300000);
        assertEqual(utc.data.budgets[0].spent, 0);
      },
    },
    {
      id: 'T3-API-03',
      tier: 3,
      feature: 'F5',
      features: ['F5', 'F6'],
      kind: 'api',
      description: 'F5 × F6: Transaction PATCH account+category+type transitions keep account balances and budget spent consistent',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const cat1 = categories[0].id;
        const cat2 = categories[1].id;
        const accA = await createAccount(ctx.apiUrl, tokenA, { name: 'Dompet A', accountType: 'cash', isShared: true, initialBalance: 1000000 });
        const accB = await createAccount(ctx.apiUrl, tokenA, { name: 'Dompet B', accountType: 'bank', isShared: true, initialBalance: 1000000 });
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: cat1, month: '2026-11', limitAmount: 1000000 });

        const tx = await createTx(ctx.apiUrl, tokenA, { categoryId: cat1, accountId: accA.id, type: 'expense', amount: 400000, occurredAt: '2026-11-10T10:00:00.000Z' });
        await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, {
          method: 'PATCH',
          token: tokenA,
          body: { accountId: accB.id, categoryId: cat2, type: 'income' },
        });

        let bdg = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=0', { token: tokenA });
        assertEqual(bdg.data.budgets[0].spent, 0, 'Flipped-to-income tx on cat2 must yield 0 spent on cat1');

        await apiRequest(ctx.apiUrl, `/api/transactions/${tx.id}`, {
          method: 'PATCH',
          token: tokenA,
          body: { categoryId: cat1, type: 'expense' },
        });
        bdg = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=0', { token: tokenA });
        assertEqual(bdg.data.budgets[0].spent, 400000);

        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        const byId = Object.fromEntries(accRes.data.accounts.map((a) => [a.id, a]));
        assertEqual(byId[accA.id].balance, 1000000);
        assertEqual(byId[accB.id].balance, 600000);
      },
    },
    {
      id: 'T3-API-04',
      tier: 3,
      feature: 'F5',
      features: ['F5', 'F4'],
      kind: 'api',
      description: 'F5 × F4: Account initialBalance edit & deletion updates accountsOverview while preserving tx analytics',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const accA = await createAccount(ctx.apiUrl, tokenA, { name: 'Dompet A', accountType: 'cash', isShared: true, initialBalance: 1000000 });
        const accB = await createAccount(ctx.apiUrl, tokenA, { name: 'Dompet B', accountType: 'bank', isShared: false, initialBalance: 2000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: accB.id, type: 'expense', amount: 500000, occurredAt: '2026-11-10T10:00:00.000Z' });

        await apiRequest(ctx.apiUrl, `/api/accounts/${accA.id}`, { method: 'PATCH', token: tokenA, body: { initialBalance: 1500000 } });
        await apiRequest(ctx.apiUrl, `/api/accounts/${accB.id}`, { method: 'DELETE', token: tokenA });

        const ana = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(ana, 200);
        assertEqual(ana.data.accountsOverview.accountsCount, 1);
        assertEqual(ana.data.accountsOverview.totalBalance, 1500000);
        assertEqual(ana.data.totals.totalExpense, 500000, 'Deleted account historical tx remains in monthly analytics');
      },
    },
    {
      id: 'T3-API-05',
      tier: 3,
      feature: 'F6',
      features: ['F6', 'F4'],
      kind: 'api',
      description: 'F6 × F4: Over-budget and under-budget category spent values match analytics.byCategory to exact rupiah',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const cat1 = categories[0].id;
        const cat2 = categories[1].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: cat1, month: '2026-11', limitAmount: 1000000 });
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: cat2, month: '2026-11', limitAmount: 1000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: cat1, type: 'expense', amount: 1200000, occurredAt: '2026-11-05T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: cat2, type: 'expense', amount: 400000, occurredAt: '2026-11-06T10:00:00.000Z' });

        const [bdg, ana] = await Promise.all([
          apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=0', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA }),
        ]);
        for (const b of bdg.data.budgets) {
          const ac = ana.data.byCategory.find((c) => c.categoryId === b.categoryId);
          assertEqual(ac.expense, b.spent, `Mismatch between analytics expense and budget spent for ${b.categoryName}`);
        }
      },
    },
    {
      id: 'T3-API-06',
      tier: 3,
      feature: 'F5',
      features: ['F5', 'F7'],
      kind: 'api',
      description: 'F5 × F7: Deleting account preserves mixed legacy/linked transactions with accountId: null and invariant summary',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const acc = await createAccount(ctx.apiUrl, tokenA, { name: 'Wallet', accountType: 'ewallet', isShared: true, initialBalance: 500000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'expense', amount: 100000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: acc.id, type: 'expense', amount: 200000 });

        await apiRequest(ctx.apiUrl, `/api/accounts/${acc.id}`, { method: 'DELETE', token: tokenA });
        const [txs, sum] = await Promise.all([
          apiRequest(ctx.apiUrl, '/api/transactions', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/summary', { token: tokenA }),
        ]);
        assertEqual(txs.data.transactions.length, 2);
        assert(txs.data.transactions.every((t) => t.accountId === null));
        assertEqual(sum.data.totalExpense, 300000);
      },
    },
    {
      id: 'T3-API-07',
      tier: 3,
      feature: 'F3',
      features: ['F3', 'F4'],
      kind: 'api',
      description: 'F3 × F4: Sum of monthly /api/analytics across 3 months equals all-time /api/summary totals',
      fn: async (ctx) => {
        const { tokenA, tokenB, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'income', amount: 3000000, occurredAt: '2026-09-15T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: categories[1].id, type: 'expense', amount: 500000, occurredAt: '2026-10-15T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[2].id, type: 'expense', amount: 750000, occurredAt: '2026-11-15T10:00:00.000Z' });

        const [sep, oct, nov, allSum] = await Promise.all([
          apiRequest(ctx.apiUrl, '/api/analytics?month=2026-09&tzOffset=0', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/analytics?month=2026-10&tzOffset=0', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/summary', { token: tokenA }),
        ]);
        const sumIncome = sep.data.totals.totalIncome + oct.data.totals.totalIncome + nov.data.totals.totalIncome;
        const sumExpense = sep.data.totals.totalExpense + oct.data.totals.totalExpense + nov.data.totals.totalExpense;
        assertEqual(sumIncome, allSum.data.totalIncome);
        assertEqual(sumExpense, allSum.data.totalExpense);
      },
    },
    {
      id: 'T3-API-08',
      tier: 3,
      feature: 'F4',
      features: ['F4', 'F7'],
      kind: 'api',
      description: 'F4 × F7: Partner B join + custom category + pinned note integrate accurately into Analytics',
      fn: async (ctx) => {
        const { tokenA, tokenB } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        const customCat = await apiRequest(ctx.apiUrl, '/api/categories', {
          method: 'POST',
          token: tokenB,
          body: { name: 'Kucing Kami', icon: '🐱', color: '#C86446', targetAmount: 2000000 },
        });
        assertStatus(customCat, 201);
        await apiRequest(ctx.apiUrl, '/api/notes', {
          method: 'POST',
          token: tokenB,
          body: { title: 'Vaksin Kucing', content: 'Bulan depan', isPinned: true },
        });
        await createTx(ctx.apiUrl, tokenA, { categoryId: customCat.data.id, type: 'income', amount: 1000000, occurredAt: '2026-11-10T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: customCat.data.id, type: 'expense', amount: 250000, occurredAt: '2026-11-11T10:00:00.000Z' });

        const ana = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(ana, 200);
        assertEqual(ana.data.byPartner.length, 2);
        const catRow = ana.data.byCategory.find((c) => c.categoryId === customCat.data.id);
        assert(catRow, 'Custom category missing from analytics.byCategory');
        assertEqual(catRow.expense, 250000);
        assertEqual(catRow.income, 1000000);
      },
    },

    // =========================================================================
    // 6 UI/Web Pairwise Interaction Tests
    // =========================================================================
    {
      id: 'T3-WEB-01',
      tier: 3,
      feature: 'F1',
      features: ['F1', 'F2'],
      kind: 'browser',
      description: 'F1 × F2: Warm Terracotta/Sage palette differentiates - Pengeluaran vs + Pemasukan shortcuts & sheet segments',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Warna Shortcut', 'Raka');

        const shortcutColors = await cdp.evalFn(() => {
          const findBg = (txt) => {
            const el = Array.from(document.querySelectorAll('*')).find((e) => (e.innerText || '').trim() === txt);
            let cur = el;
            while (cur) {
              const bg = getComputedStyle(cur).backgroundColor;
              if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
              cur = cur.parentElement;
            }
            return null;
          };
          return {
            inBg: findBg('+ Pemasukan'),
            outBg: findBg('- Pengeluaran'),
          };
        });
        assert(shortcutColors.inBg && shortcutColors.outBg, `Missing shortcut backgrounds: ${JSON.stringify(shortcutColors)}`);
        assert(shortcutColors.inBg !== shortcutColors.outBg, 'Income and Expense shortcuts should have distinct warm colors');

        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('Simpan');
        const audit = await cdp.getDomAudit();
        assertEqual(audit.contrastFailures.length, 0, `Sheet contrast failures: ${JSON.stringify(audit.contrastFailures)}`);
      },
    },
    {
      id: 'T3-WEB-02',
      tier: 3,
      feature: 'F1',
      features: ['F1', 'F8'],
      kind: 'browser',
      description: 'F1 × F8: Warm FeedbackBanner & ConfirmModal render with accessible contrast on mobile (375x812) and desktop (1280x800)',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        for (const [w, h, mob] of [[375, 812, true], [1280, 800, false]]) {
          await cdp.setViewport(w, h, mob);
          await cdp.navigate(webUrl);
          await cdp.clearStorage();
          await cdp.reload();
          await cdp.waitForText('Buat Ruang Baru');
          await cdp.fillInput('Raka / Nadia', 'X');
          await cdp.clickByText(/Mulai & Dapatkan Kode Undangan|Mulai Sekarang|^Buat Ruang$/i);
          await cdp.waitForText(/minimal 2|karakter/i);
          const audit = await cdp.getDomAudit();
          assertEqual(audit.contrastFailures.length, 0, `Banner contrast failure at ${w}x${h}: ${JSON.stringify(audit.contrastFailures)}`);
        }
      },
    },
    {
      id: 'T3-WEB-03',
      tier: 3,
      feature: 'F2',
      features: ['F2', 'F3'],
      kind: 'browser',
      description: 'F2 × F3: Switching MonthSelector updates Dashboard, Transactions, Analytics & Budgets cleanly without cross-month bleed',
      fn: async (ctx) => {
        const { cdp, webUrl, apiUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Bulan Filter', 'Raka');
        const { token, categories } = await extractSessionFromBrowser(cdp, apiUrl);

        // Seed transaction in previous month
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - 1);
        d.setDate(15);
        await createTx(apiUrl, token, { categoryId: categories[0].id, type: 'expense', amount: 333000, note: 'Bulan Lalu Item', occurredAt: d.toISOString() });

        await cdp.reload();
        await cdp.waitForText(/Selama Sebulan/);
        // Current month must NOT contain 333.000
        assert(!(await cdp.getBodyText()).includes('Rp 333.000'), 'Prior-month tx leaked into current month Dashboard');

        // Step to previous month
        await cdp.clickByText(/^‹$|^<$/);
        await cdp.waitForText('Rp 333.000');

        await cdp.clickByText('Transaksi', { exact: true, last: true });
        await cdp.waitForText('Bulan Lalu Item');

        await cdp.clickByText('Analitik', { exact: true, last: true });
        await cdp.waitForText('Rp 333.000');
      },
    },
    {
      id: 'T3-WEB-04',
      tier: 3,
      feature: 'F2',
      features: ['F2', 'F5'],
      kind: 'browser',
      description: 'F2 × F5: QuickEntrySheet account picker + 250rb preset updates Dompet balance in UI',
      fn: async (ctx) => {
        const { cdp, webUrl, apiUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Dompet Shortcut', 'Raka');
        const { token } = await extractSessionFromBrowser(cdp, apiUrl);
        await createAccount(apiUrl, token, { name: 'GoPay Bersama', accountType: 'ewallet', isShared: true, initialBalance: 1000000 });

        await cdp.reload();
        await cdp.waitForText(/Ringkas/);
        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('GoPay Bersama');
        await cdp.clickByText(/GoPay Bersama/, { last: true });
        await cdp.clickByText('250rb', { exact: true, last: true });
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');
        await cdp.waitForText('Rp 250.000');

        await cdp.clickByText('Dompet', { exact: true, last: true });
        await cdp.waitForText('GoPay Bersama');
        await cdp.waitForText('Rp 750.000');
      },
    },
    {
      id: 'T3-WEB-05',
      tier: 3,
      feature: 'F2',
      features: ['F2', 'F6'],
      kind: 'browser',
      description: 'F2 × F6: Quick shortcuts progress budget from 50% (100rb) to 125% over-budget (+150rb) in Anggaran UI',
      fn: async (ctx) => {
        const { cdp, webUrl, apiUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Budget Shortcut', 'Raka');
        const { token, categories } = await extractSessionFromBrowser(cdp, apiUrl);
        const now = new Date();
        const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await saveBudget(apiUrl, token, { categoryId: categories[0].id, month: m, limitAmount: 200000 });

        await cdp.reload();
        await cdp.waitForText(/Ringkas/);

        // Add 100rb expense -> 50%
        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('100rb');
        await cdp.clickByText('100rb', { exact: true, last: true });
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');
        await cdp.waitForText('Rp 100.000');

        await cdp.clickByText('Anggaran', { exact: true, last: true });
        await cdp.waitForText('50%');

        // Add another 100rb + 50rb? Use custom 150000 via + Catat -> 125%
        await cdp.clickByText('+ Catat');
        await cdp.waitForText('Simpan');
        await cdp.fillInput(/Nominal|500000|Contoh:/i, '150000');
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');
        await cdp.waitForText('125%');
      },
    },
    {
      id: 'T3-WEB-06',
      tier: 3,
      feature: 'F8',
      features: ['F8', 'F7'],
      kind: 'browser',
      description: 'F8 × F7: Legacy Pos & Target, Catatan, and accountId: null ("Tanpa Dompet") transactions work cleanly on Web',
      fn: async (ctx) => {
        const { cdp, webUrl, apiUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        cdp.clearTrackedErrors();
        await createCoupleViaUi(cdp, webUrl, 'Legacy Web', 'Raka');
        const { token, categories } = await extractSessionFromBrowser(cdp, apiUrl);
        await createTx(apiUrl, token, { categoryId: categories[0].id, type: 'expense', amount: 85000, note: 'Warisan' });

        await cdp.reload();
        await cdp.waitForText(/Ringkas/);
        await cdp.clickByText('Transaksi', { exact: true, last: true });
        await cdp.waitForText('Warisan');

        // Visit Pos & Target and Catatan
        await cdp.clickByText('Ringkas', { exact: true, last: true });
        await cdp.clickByText(/Pos\s*&\s*Target|^Pos$/i, { clickableOnly: true });
        await cdp.waitForText(/Menikah/);

        await cdp.clickByText(/^(?:📝\s*)?Catatan$/i, { clickableOnly: true });
        await cdp.waitForText(/Catatan/i);

        const errs = cdp.getErrors();
        assertEqual(errs.exceptions.length, 0);
        assertEqual(errs.consoleErrors.length, 0);
      },
    },
  ];
}
