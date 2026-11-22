// Tier 4 — Real-World Couple Application Scenarios (11 tests: 6 multi-step API + 5 Headless Chromium Web)

import {
  apiRequest,
  assert,
  assertEqual,
  assertStatus,
  createAccount,
  createCouple,
  createTx,
  joinCouple,
  saveBudget,
  setupCoupleContext,
} from '../lib/harness.mjs';

async function createCoupleViaUi(cdp, webUrl, coupleName = 'Pasangan Nyata', partnerName = 'Raka') {
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
  assert(token, 'Expected persisted session token in localStorage');
  const catRes = await apiRequest(apiUrl, '/api/categories', { token });
  assertStatus(catRes, 200);
  return { token, categories: catRes.data };
}

export function getTier4Tests() {
  return [
    // =========================================================================
    // 6 Multi-Step Real-World API Workflows
    // =========================================================================
    {
      id: 'T4-API-01',
      tier: 4,
      feature: 'F5',
      features: ['F5', 'F4', 'F7'],
      kind: 'api',
      description: 'Scenario 1: New Couple Payday & Shared Wallet Setup (create, join, personal+shared wallets, payday + transfer)',
      fn: async (ctx) => {
        const { tokenA, tokenB, partnerA, partnerB, categories } = await setupCoupleContext(ctx.apiUrl, {
          withPartnerB: true,
          coupleName: 'Raka & Nadia',
          nameA: 'Raka',
          nameB: 'Nadia',
        });

        const bcaRaka = await createAccount(ctx.apiUrl, tokenA, {
          name: 'BCA Raka',
          accountType: 'bank',
          isShared: false,
          ownerPartnerId: partnerA.id,
          initialBalance: 2000000,
        });
        const gopayNadia = await createAccount(ctx.apiUrl, tokenB, {
          name: 'GoPay Nadia',
          accountType: 'ewallet',
          isShared: false,
          ownerPartnerId: partnerB.id,
          initialBalance: 500000,
        });
        const sharedSavings = await createAccount(ctx.apiUrl, tokenA, {
          name: 'Tabungan Bersama',
          accountType: 'shared_savings',
          isShared: true,
          initialBalance: 10000000,
        });

        // Payday + transfer into shared savings
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[2].id, accountId: bcaRaka.id, type: 'income', amount: 8000000, note: 'Gaji Raka', occurredAt: '2026-11-01T08:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: bcaRaka.id, type: 'expense', amount: 2000000, note: 'Setor tabungan', occurredAt: '2026-11-01T09:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, accountId: sharedSavings.id, type: 'income', amount: 2000000, note: 'Terima setoran', occurredAt: '2026-11-01T09:01:00.000Z' });

        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenB });
        assertStatus(accRes, 200);
        assertEqual(accRes.data.totals.totalBalance, 20500000);
        assertEqual(accRes.data.totals.sharedBalance, 12000000);
        assertEqual(accRes.data.totals.personalBalance, 8500000);

        const anaRes = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: tokenA });
        assertStatus(anaRes, 200);
        assertEqual(anaRes.data.accountsOverview.totalBalance, 20500000);
        assertEqual(anaRes.data.totals.totalIncome, 10000000);
        assertEqual(anaRes.data.totals.totalExpense, 2000000);
        assertEqual(anaRes.data.totals.transactionCount, 3);
        assert(gopayNadia.id, 'gopayNadia should exist');
      },
    },
    {
      id: 'T4-API-02',
      tier: 4,
      feature: 'F6',
      features: ['F3', 'F6', 'F4'],
      kind: 'api',
      description: 'Scenario 2: Monthly Budgeting Lifecycle ("Selama Sebulan") with overrun -> PUT raise -> empty Dec switch',
      fn: async (ctx) => {
        const { tokenA, tokenB, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        const catHome = categories.find((c) => c.name.includes('Rumah')) || categories[3];
        const catTravel = categories.find((c) => c.name.includes('Travel')) || categories[1];

        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catHome.id, month: '2026-11', limitAmount: 3000000 }, 'POST');
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catTravel.id, month: '2026-11', limitAmount: 1500000 }, 'POST');

        await createTx(ctx.apiUrl, tokenA, { categoryId: catHome.id, type: 'expense', amount: 1500000, occurredAt: '2026-11-03T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: catHome.id, type: 'expense', amount: 1200000, occurredAt: '2026-11-10T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catTravel.id, type: 'expense', amount: 1000000, occurredAt: '2026-11-12T10:00:00.000Z' });
        await createTx(ctx.apiUrl, tokenB, { categoryId: catTravel.id, type: 'expense', amount: 800000, occurredAt: '2026-11-14T10:00:00.000Z' });

        let bdg = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=0', { token: tokenA });
        let homeB = bdg.data.budgets.find((b) => b.categoryId === catHome.id);
        let travelB = bdg.data.budgets.find((b) => b.categoryId === catTravel.id);
        assertEqual(homeB.progressPercent, 90);
        assertEqual(homeB.isOverBudget, false);
        assertEqual(travelB.progressPercent, 120);
        assertEqual(travelB.isOverBudget, true);

        // Raise Traveling budget to 2M via PUT
        await saveBudget(ctx.apiUrl, tokenB, { categoryId: catTravel.id, month: '2026-11', limitAmount: 2000000 }, 'PUT');
        bdg = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=0', { token: tokenA });
        travelB = bdg.data.budgets.find((b) => b.categoryId === catTravel.id);
        assertEqual(travelB.progressPercent, 90);
        assertEqual(travelB.isOverBudget, false);

        // Switch to 2026-12 -> isolated empty
        const decBdg = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-12&tzOffset=0', { token: tokenA });
        const decAna = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-12&tzOffset=0', { token: tokenA });
        assertEqual(decBdg.data.budgets.length, 0);
        assertEqual(decAna.data.totals.transactionCount, 0);
      },
    },
    {
      id: 'T4-API-03',
      tier: 4,
      feature: 'F5',
      features: ['F5', 'F3', 'F4', 'F6'],
      kind: 'api',
      description: 'Scenario 3: Mistake Correction & Re-attribution (PATCH account/category/amount/month + partnerId preservation)',
      fn: async (ctx) => {
        const { tokenA, tokenB, partnerA, partnerB, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true });
        const bcaRaka = await createAccount(ctx.apiUrl, tokenA, { name: 'BCA Raka', accountType: 'bank', isShared: false, ownerPartnerId: partnerA.id, initialBalance: 2000000 });
        const gopayNadia = await createAccount(ctx.apiUrl, tokenB, { name: 'GoPay Nadia', accountType: 'ewallet', isShared: false, ownerPartnerId: partnerB.id, initialBalance: 1000000 });

        const catWedding = categories[0].id;
        const catHome = categories[3].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catHome, month: '2026-11', limitAmount: 1000000 });

        // Partner A makes mistaken tx in Oct + duplicate tx
        const mistaken = await createTx(ctx.apiUrl, tokenA, {
          categoryId: catWedding,
          accountId: bcaRaka.id,
          type: 'expense',
          amount: 500000,
          occurredAt: '2026-10-31T20:00:00.000Z',
        });
        const dup = await createTx(ctx.apiUrl, tokenA, {
          categoryId: catWedding,
          accountId: bcaRaka.id,
          type: 'expense',
          amount: 100000,
          occurredAt: '2026-10-20T10:00:00.000Z',
        });

        // Partner B corrects mistaken tx to Nov 1 WIB, GoPay Nadia, catHome, 350k
        const patch = await apiRequest(ctx.apiUrl, `/api/transactions/${mistaken.id}`, {
          method: 'PATCH',
          token: tokenB,
          body: {
            amount: 350000,
            accountId: gopayNadia.id,
            categoryId: catHome,
            occurredAt: '2026-11-01T10:00:00+07:00',
          },
        });
        assertStatus(patch, 200);
        assertEqual(patch.data.transaction.partnerId, partnerA.id, 'Partner A attribution must remain intact');

        // Delete duplicate
        assertStatus(await apiRequest(ctx.apiUrl, `/api/transactions/${dup.id}`, { method: 'DELETE', token: tokenA }), 200);

        const accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        const byId = Object.fromEntries(accRes.data.accounts.map((a) => [a.id, a]));
        assertEqual(byId[bcaRaka.id].balance, 2000000);
        assertEqual(byId[gopayNadia.id].balance, 650000);

        const octAna = await apiRequest(ctx.apiUrl, '/api/analytics?month=2026-10&tzOffset=420', { token: tokenA });
        const novBdg = await apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=420', { token: tokenA });
        assertEqual(octAna.data.totals.transactionCount, 0);
        assertEqual(novBdg.data.budgets[0].spent, 350000);
      },
    },
    {
      id: 'T4-API-04',
      tier: 4,
      feature: 'F7',
      features: ['F7', 'F5', 'F3'],
      kind: 'api',
      description: 'Scenario 4: Legacy Migration (accountId: null) + Wallet Adoption & Account Closure',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const leg1 = await createTx(ctx.apiUrl, tokenA, { categoryId: categories[0].id, type: 'income', amount: 3000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[1].id, type: 'expense', amount: 500000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[2].id, type: 'expense', amount: 250000 });
        await apiRequest(ctx.apiUrl, '/api/notes', { method: 'POST', token: tokenA, body: { title: 'Sebelum Dompet', content: 'Catatan lama' } });

        const cash = await createAccount(ctx.apiUrl, tokenA, { name: 'Dompet Tunai', accountType: 'cash', isShared: true, initialBalance: 1000000 });
        await createTx(ctx.apiUrl, tokenA, { categoryId: categories[3].id, accountId: cash.id, type: 'expense', amount: 200000 });
        await apiRequest(ctx.apiUrl, `/api/transactions/${leg1.id}`, { method: 'PATCH', token: tokenA, body: { accountId: cash.id } });

        let accRes = await apiRequest(ctx.apiUrl, '/api/accounts', { token: tokenA });
        assertEqual(accRes.data.accounts[0].balance, 3800000);

        // Close Dompet Tunai -> transactions survive with accountId: null
        assertStatus(await apiRequest(ctx.apiUrl, `/api/accounts/${cash.id}`, { method: 'DELETE', token: tokenA }), 200);
        const [txs, sum] = await Promise.all([
          apiRequest(ctx.apiUrl, '/api/transactions', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/summary', { token: tokenA }),
        ]);
        assertEqual(txs.data.transactions.length, 4);
        assert(txs.data.transactions.every((t) => t.accountId === null));
        assertEqual(sum.data.totalIncome, 3000000);
        assertEqual(sum.data.totalExpense, 950000);
      },
    },
    {
      id: 'T4-API-05',
      tier: 4,
      feature: 'F7',
      features: ['F7', 'F5', 'F6', 'F4'],
      kind: 'api',
      description: 'Scenario 5: Multi-Couple Concurrent Privacy & Tenant Isolation Audit',
      fn: async (ctx) => {
        const c1 = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true, coupleName: 'Raka & Nadia' });
        const c2 = await setupCoupleContext(ctx.apiUrl, { withPartnerB: true, coupleName: 'Budi & Sari' });

        const [acc1, acc2] = await Promise.all([
          createAccount(ctx.apiUrl, c1.tokenA, { name: 'Dompet 1', accountType: 'bank', isShared: true, initialBalance: 5000000 }),
          createAccount(ctx.apiUrl, c2.tokenA, { name: 'Dompet 2', accountType: 'bank', isShared: true, initialBalance: 8000000 }),
        ]);

        const [b1, b2] = await Promise.all([
          saveBudget(ctx.apiUrl, c1.tokenA, { categoryId: c1.categories[0].id, month: '2026-11', limitAmount: 1000000 }),
          saveBudget(ctx.apiUrl, c2.tokenA, { categoryId: c2.categories[0].id, month: '2026-11', limitAmount: 2000000 }),
        ]);

        await Promise.all([
          createTx(ctx.apiUrl, c1.tokenB, { categoryId: c1.categories[0].id, accountId: acc1.id, type: 'expense', amount: 400000, occurredAt: '2026-11-05T10:00:00.000Z' }),
          createTx(ctx.apiUrl, c2.tokenB, { categoryId: c2.categories[0].id, accountId: acc2.id, type: 'expense', amount: 900000, occurredAt: '2026-11-05T10:00:00.000Z' }),
        ]);

        // Cross-couple attacks must fail cleanly
        assertStatus(await apiRequest(ctx.apiUrl, `/api/accounts/${acc1.id}`, { method: 'DELETE', token: c2.tokenA }), 404);
        assertStatus(await apiRequest(ctx.apiUrl, `/api/budgets/${b1.id}`, { method: 'PATCH', token: c2.tokenB, body: { limitAmount: 10 } }), 404);
        assertStatus(await apiRequest(ctx.apiUrl, '/api/transactions', { method: 'POST', token: c1.tokenA, body: { categoryId: c1.categories[0].id, accountId: acc2.id, type: 'expense', amount: 100000 } }), [400, 404]);

        const [ana1, ana2] = await Promise.all([
          apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: c1.tokenA }),
          apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=0', { token: c2.tokenA }),
        ]);
        assertEqual(ana1.data.totals.totalExpense, 400000);
        assertEqual(ana1.data.accountsOverview.totalBalance, 4600000);
        assertEqual(ana2.data.totals.totalExpense, 900000);
        assertEqual(ana2.data.accountsOverview.totalBalance, 7100000);
        assert(b2.id, 'b2 exists');
      },
    },
    {
      id: 'T4-API-06',
      tier: 4,
      feature: 'F3',
      features: ['F3', 'F5', 'F6', 'F4'],
      kind: 'api',
      description: 'Scenario 6: Late-Night Indonesia WIB (tzOffset=420) Month-End Close reconciliation',
      fn: async (ctx) => {
        const { tokenA, categories } = await setupCoupleContext(ctx.apiUrl, { withPartnerB: false });
        const catId = categories[0].id;
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-10', limitAmount: 1000000 });
        await saveBudget(ctx.apiUrl, tokenA, { categoryId: catId, month: '2026-11', limitAmount: 1000000 });

        // 23:30 WIB Oct 31 = 16:30Z Oct 31; 00:30 WIB Nov 1 = 17:30Z Oct 31
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 200000, occurredAt: '2026-10-31T16:30:00.000Z' });
        await createTx(ctx.apiUrl, tokenA, { categoryId: catId, type: 'expense', amount: 350000, occurredAt: '2026-10-31T17:30:00.000Z' });

        const [octB, novB, octA, novA] = await Promise.all([
          apiRequest(ctx.apiUrl, '/api/budgets?month=2026-10&tzOffset=420', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/budgets?month=2026-11&tzOffset=420', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/analytics?month=2026-10&tzOffset=420', { token: tokenA }),
          apiRequest(ctx.apiUrl, '/api/analytics?month=2026-11&tzOffset=420', { token: tokenA }),
        ]);
        assertEqual(octB.data.budgets[0].spent, 200000);
        assertEqual(octA.data.totals.totalExpense, 200000);
        assertEqual(novB.data.budgets[0].spent, 350000);
        assertEqual(novA.data.totals.totalExpense, 350000);
      },
    },

    // =========================================================================
    // 5 Live Headless Chromium Expo Web End-to-End Scenarios
    // =========================================================================
    {
      id: 'T4-WEB-01',
      tier: 4,
      feature: 'F1',
      features: ['F1', 'F7', 'F8'],
      kind: 'browser',
      description: 'Web Scenario 1: Warm Onboarding validation, 6-char invite pairing, reload persistence & Partner B join',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        cdp.clearTrackedErrors();
        await cdp.navigate(webUrl);
        await cdp.clearStorage();
        await cdp.reload();
        await cdp.waitForText('Buat Ruang Baru');

        // 1-char error feedback banner (no Alert.alert)
        await cdp.fillInput('Raka / Nadia', 'A');
        await cdp.clickByText(/Mulai & Dapatkan Kode Undangan|Mulai Sekarang|^Buat Ruang$/i);
        await cdp.waitForText(/minimal 2|karakter/i);

        // Partner A creates couple
        await cdp.fillInput('Dompet Masa Depan', 'Rumah Raka Nadia');
        await cdp.fillInput('Raka / Nadia', 'Raka');
        await cdp.clickByText(/Mulai & Dapatkan Kode Undangan|Mulai Sekarang|^Buat Ruang$/i);
        await cdp.waitForText('Rumah Raka Nadia');

        const headerText = await cdp.getBodyText();
        const codeMatch = headerText.match(/Kode:\s*([A-F0-9]{6})/i);
        assert(codeMatch, `6-char invite code not visible in header:\n${headerText.slice(0, 300)}`);
        const inviteCode = codeMatch[1];

        const audit = await cdp.getDomAudit();
        assertEqual(audit.contrastFailures.length, 0, `WCAG contrast failure: ${JSON.stringify(audit.contrastFailures)}`);

        // Session persists on reload
        await cdp.reload();
        await cdp.waitForText('Rumah Raka Nadia');

        // Partner B joins in clean storage
        await cdp.clearStorage();
        await cdp.reload();
        await cdp.waitForText('Gabung Pasangan');
        await cdp.clickByText('Gabung Pasangan', { exact: true });
        await cdp.waitForText(/Kode Undangan|A1B2C3/i);
        await cdp.fillInput(/A1B2C3|Kode Undangan/i, inviteCode);
        await cdp.fillInput('Raka / Nadia', 'Nadia');
        await cdp.clickByText('Gabung Sekarang');
        await cdp.waitForText('Rumah Raka Nadia');
        await cdp.waitForText(/Nadia/);

        const errs = cdp.getErrors();
        assertEqual(errs.exceptions.length, 0);
        assertEqual(errs.consoleErrors.length, 0);
      },
    },
    {
      id: 'T4-WEB-02',
      tier: 4,
      feature: 'F2',
      features: ['F2', 'F5', 'F1'],
      kind: 'browser',
      description: 'Web Scenario 2: Quick Shortcuts (-250rb, +500rb) sync Hero Net & Dompet wallet balances',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Dompet Kilat', 'Raka');

        // Create account via Dompet tab UI
        await cdp.clickByText('Dompet', { exact: true, last: true });
        await cdp.clickByText(/Tambah Dompet|Tambah Akun|\+ Dompet|\+ Tambah/i);
        await cdp.fillInput(/Nama Dompet|Nama Akun|BCA|Cash/i, 'Tabungan Bersama');
        await cdp.fillInput(/Saldo Awal|Initial|1\.?000\.?000/i, '1000000');
        await cdp.clickByText(/Simpan/i, { last: true });
        await cdp.waitForText('Tabungan Bersama');
        await cdp.waitForText('Rp 1.000.000');

        // -250rb expense on Tabungan Bersama
        await cdp.clickByText('Ringkas', { exact: true, last: true });
        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('250rb');
        await cdp.clickByText(/Tabungan Bersama/, { last: true });
        await cdp.clickByText('250rb', { exact: true, last: true });
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');
        await cdp.waitForText('Rp 250.000');

        await cdp.clickByText('Dompet', { exact: true, last: true });
        await cdp.waitForText('Rp 750.000');

        // +500rb income on Tabungan Bersama -> Rp 1.250.000
        await cdp.clickByText('Ringkas', { exact: true, last: true });
        await cdp.clickByText('+ Pemasukan');
        await cdp.waitForText('500rb');
        await cdp.clickByText(/Tabungan Bersama/, { last: true });
        await cdp.clickByText('500rb', { exact: true, last: true });
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');

        await cdp.clickByText('Dompet', { exact: true, last: true });
        await cdp.waitForText('Rp 1.250.000');
      },
    },
    {
      id: 'T4-WEB-03',
      tier: 4,
      feature: 'F3',
      features: ['F2', 'F3', 'F4', 'F6'],
      kind: 'browser',
      description: 'Web Scenario 3: "Selama Sebulan" MonthSelector switching updates Ringkas, Transaksi, Analitik & Anggaran',
      fn: async (ctx) => {
        const { cdp, webUrl, apiUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Kalender Couple', 'Raka');
        const { token, categories } = await extractSessionFromBrowser(cdp, apiUrl);

        // Seed previous month tx + budget
        const prev = new Date();
        prev.setDate(1);
        prev.setMonth(prev.getMonth() - 1);
        const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
        prev.setDate(15);
        await saveBudget(apiUrl, token, { categoryId: categories[0].id, month: prevMonth, limitAmount: 500000 });
        await createTx(apiUrl, token, { categoryId: categories[0].id, type: 'expense', amount: 250000, note: 'Transaksi Lalu', occurredAt: prev.toISOString() });

        await cdp.reload();
        await cdp.waitForText(/Selama Sebulan/);

        // Add current month 100rb tx via UI
        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('100rb');
        await cdp.clickByText('100rb', { exact: true, last: true });
        await cdp.fillInput(/Catatan|Catering/i, 'Transaksi Kini');
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');
        await cdp.waitForText('Rp 100.000');

        // Step back to prior month -> see Rp 250.000 & 50% budget
        await cdp.clickByText(/^‹$|^<$/);
        await cdp.waitForText('Rp 250.000');
        await cdp.clickByText('Transaksi', { exact: true, last: true });
        await cdp.waitForText('Transaksi Lalu');
        assert(!(await cdp.getBodyText()).includes('Transaksi Kini'));

        await cdp.clickByText('Anggaran', { exact: true, last: true });
        await cdp.waitForText('50%');

        // Step forward twice into empty next month -> clean 0 states, no NaN
        await cdp.clickByText(/^›$|^>$/);
        await cdp.clickByText(/^›$|^>$/);
        await cdp.clickByText('Analitik', { exact: true, last: true });
        const emptyAudit = await cdp.getDomAudit();
        assert(!emptyAudit.hasNaN && !emptyAudit.hasInfinity && !emptyAudit.hasUndefined);

        // Return to Bulan Ini
        await cdp.clickByText(/Bulan Ini/i);
        await cdp.clickByText('Transaksi', { exact: true, last: true });
        await cdp.waitForText('Transaksi Kini');
      },
    },
    {
      id: 'T4-WEB-04',
      tier: 4,
      feature: 'F6',
      features: ['F1', 'F2', 'F5', 'F6', 'F8'],
      kind: 'browser',
      description: 'Web Scenario 4: Set budget -> 50% expense -> Edit tx to 125% overrun -> ConfirmModal cancel & delete',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Siklus Anggaran', 'Raka');

        // Create Rp 200.000 budget in Anggaran tab for Rumah Tangga
        await cdp.clickByText('Anggaran', { exact: true, last: true });
        await cdp.clickByText(/Atur Anggaran|Tambah Anggaran|\+ Anggaran|\+ Tambah/i);
        await cdp.clickByText(/Rumah Tangga/, { last: true });
        await cdp.fillInput(/Batas|Limit|Nominal|2000000|2\.000\.000/i, '200000');
        await cdp.clickByText(/Simpan/i, { last: true });
        await cdp.waitForText('Rp 200.000');

        // Add 100rb expense on Rumah Tangga -> 50%
        await cdp.clickByText('Ringkas', { exact: true, last: true });
        await cdp.clickByText('- Pengeluaran');
        await cdp.waitForText('100rb');
        await cdp.clickByText(/Rumah Tangga/, { last: true });
        await cdp.clickByText('100rb', { exact: true, last: true });
        await cdp.fillInput(/Catatan|Catering/i, 'Makan Malam');
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');

        await cdp.clickByText('Anggaran', { exact: true, last: true });
        await cdp.waitForText('50%');

        // Edit tx in Transaksi to 250000 -> 125% over-budget
        await cdp.clickByText('Transaksi', { exact: true, last: true });
        await cdp.waitForText('Makan Malam');
        await cdp.clickByText('Edit', { exact: true });
        await cdp.waitForText('Simpan');
        await cdp.fillInput(/Nominal|500000|500\.000/i, '250000');
        await cdp.clickByText('Simpan', { exact: true, last: true });
        await cdp.waitForGoneText('Simpan');
        await cdp.waitForText('Rp 250.000');

        await cdp.clickByText('Anggaran', { exact: true, last: true });
        await cdp.waitForText('125%');

        // Delete with ConfirmModal cancel then confirm
        await cdp.clickByText('Transaksi', { exact: true, last: true });
        await cdp.clickByText('Hapus', { exact: true });
        await cdp.waitForText('Batal');
        await cdp.clickByText('Batal', { exact: true, last: true });
        await new Promise((r) => setTimeout(r, 150));
        assert((await cdp.getBodyText()).includes('Makan Malam'));

        await cdp.clickByText('Hapus', { exact: true });
        await cdp.waitForText('Batal');
        await cdp.clickByText(/^Hapus$|^Ya, Hapus$/i, { last: true });
        await cdp.waitForGoneText('Makan Malam');

        await cdp.clickByText('Anggaran', { exact: true, last: true });
        await cdp.waitForText('0%');
      },
    },
    {
      id: 'T4-WEB-05',
      tier: 4,
      feature: 'F8',
      features: ['F7', 'F8', 'F1'],
      kind: 'browser',
      description: 'Web Scenario 5: Mobile/Desktop viewport switch across all 5 tabs + Pos & Target + Catatan with 0 errors & WCAG compliance',
      fn: async (ctx) => {
        const { cdp, webUrl } = ctx;
        cdp.clearTrackedErrors();
        await cdp.setViewport(375, 812, true);
        await createCoupleViaUi(cdp, webUrl, 'Semua Layar', 'Raka');

        // Visit all 5 primary tabs on mobile
        for (const tab of ['Transaksi', 'Analitik', 'Dompet', 'Anggaran', 'Ringkas']) {
          await cdp.clickByText(tab, { exact: true, last: true });
          await new Promise((r) => setTimeout(r, 150));
          const audit = await cdp.getDomAudit();
          assert(audit.scrollWidth <= 375, `Mobile overflow on tab ${tab}: ${audit.scrollWidth}`);
          assertEqual(audit.contrastFailures.length, 0, `WCAG failure on ${tab}: ${JSON.stringify(audit.contrastFailures)}`);
        }

        // Switch to desktop 1280x800 and exercise Pos & Target + Catatan
        await cdp.setViewport(1280, 800, false);
        await cdp.clickByText(/Pos\s*&\s*Target|^Pos$/i, { clickableOnly: true });
        await cdp.waitForText(/Menikah/);
        await cdp.clickByText(/\+ Tambah Pos|\+ Pos/i);
        await cdp.fillInput(/Nama Kategori|Cicilan/i, 'Dana Liburan');
        await cdp.clickByText(/Tambah Pos|Simpan/i, { last: true });
        await cdp.waitForText('Dana Liburan');

        await cdp.clickByText(/^(?:📝\s*)?Catatan$/i, { clickableOnly: true });
        await cdp.clickByText(/\+ Catatan/i);
        await cdp.fillInput(/Judul|Vendor/i, 'Checklist Bulanan');
        await cdp.fillInput(/Isi|rencana/i, 'Bayar listrik & air');
        await cdp.clickByText(/Simpan Catatan|Simpan/i, { last: true });
        await cdp.waitForText('Checklist Bulanan');

        const errs = cdp.getErrors();
        assertEqual(errs.exceptions.length, 0, `Exceptions: ${JSON.stringify(errs.exceptions)}`);
        assertEqual(errs.consoleErrors.length, 0, `Console errors: ${JSON.stringify(errs.consoleErrors)}`);
        assertEqual(errs.serverErrors.length, 0, `HTTP 5xx errors: ${JSON.stringify(errs.serverErrors)}`);
      },
    },
  ];
}
