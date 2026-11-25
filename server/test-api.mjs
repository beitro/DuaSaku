import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { startServer, stopServer, cleanupCouple } from './index.mjs';

const server = await startServer(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
const createdCoupleIds = [];

async function reqStatus(path, { token, method = 'GET', body, rawBody, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, ok: res.ok, headers: res.headers, data };
}

async function req(path, opts = {}) {
  const r = await reqStatus(path, opts);
  assert.ok(r.ok, `${opts.method || 'GET'} ${path} failed (${r.status}): ${JSON.stringify(r.data)}`);
  return r.data;
}

try {
  // ==========================================================================
  // Suite 1: Health, CORS PUT preflight & Couple Onboarding
  // ==========================================================================
  const health = await req('/api/health');
  assert.equal(health.ok, true);
  assert.ok(['memory', 'postgresql'].includes(health.storage));

  const corsCheck = await reqStatus('/api/budgets', { method: 'OPTIONS' });
  assert.equal(corsCheck.status, 204);
  const allowMethods = corsCheck.headers.get('access-control-allow-methods') || '';
  assert.ok(allowMethods.includes('PUT'), `Expected PUT in Access-Control-Allow-Methods, got: ${allowMethods}`);

  const partnerA = await req('/api/couples/create', {
    method: 'POST',
    body: { coupleName: 'Dompet Masa Depan', partnerName: 'Raka' },
  });
  createdCoupleIds.push(partnerA.couple.id);
  assert.equal(partnerA.couple.inviteCode.length, 6);
  assert.equal(partnerA.partner.roleLabel, 'Partner A');

  // Join using lowercase invite code
  const partnerB = await req('/api/couples/join', {
    method: 'POST',
    body: { inviteCode: partnerA.couple.inviteCode.toLowerCase(), partnerName: 'Nadia' },
  });
  assert.equal(partnerB.couple.id, partnerA.couple.id);
  assert.equal(partnerB.partner.roleLabel, 'Partner B');

  const coupleInfo = await req('/api/couple', { token: partnerA.token });
  assert.equal(coupleInfo.id, partnerA.couple.id);
  assert.equal(coupleInfo.partners.length, 2);

  // Isolated second couple for cross-tenant checks
  const partnerC = await req('/api/couples/create', {
    method: 'POST',
    body: { coupleName: 'Dompet Tetangga', partnerName: 'Bima' },
  });
  createdCoupleIds.push(partnerC.couple.id);

  // ==========================================================================
  // Suite 2: Categories & Shared Notes
  // ==========================================================================
  const cats = await req('/api/categories', { token: partnerA.token });
  assert.equal(cats.length, 4);
  assert.ok(cats.some((c) => c.name.includes('Menikah')));
  assert.ok(cats.some((c) => c.name.includes('Traveling')));
  assert.ok(cats.some((c) => c.name.includes('Investasi')));
  assert.ok(cats.some((c) => c.name.includes('Rumah Tangga')));

  const customCat = await req('/api/categories', {
    token: partnerB.token,
    method: 'POST',
    body: { name: 'Cicilan Rumah', icon: '🏡', color: '#8C6D5A', targetAmount: 250000000 },
  });
  assert.equal(customCat.name, 'Cicilan Rumah');

  const weddingCat = cats.find((c) => c.name.includes('Menikah'));
  const travelCat = cats.find((c) => c.name.includes('Traveling'));
  const homeCat = cats.find((c) => c.name.includes('Rumah Tangga'));

  const createdNote = await req('/api/notes', {
    token: partnerB.token,
    method: 'POST',
    body: {
      title: 'Checklist Vendor Nikah',
      content: 'Catering DP lunas, tinggal fitting baju',
      categoryId: weddingCat.id,
      isPinned: true,
    },
  });
  assert.equal(createdNote.isPinned, true);
  assert.equal(createdNote.categoryId, weddingCat.id);

  const notes = await req('/api/notes', { token: partnerA.token });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'Checklist Vendor Nikah');

  // ==========================================================================
  // Suite 3: Accounts CRUD & Personal vs Shared
  // ==========================================================================
  const cashRes = await req('/api/accounts', {
    token: partnerA.token,
    method: 'POST',
    body: {
      name: 'Dompet Cash Raka',
      accountType: 'cash',
      isShared: false,
      initialBalance: 1000000,
      icon: '💵',
      color: '#5B8260',
    },
  });
  const cashAcc = cashRes.account;
  assert.equal(cashAcc.balance, 1000000);
  assert.equal(cashAcc.ownerPartnerId, partnerA.partner.id);
  assert.equal(cashAcc.isShared, false);

  const bankRes = await req('/api/accounts', {
    token: partnerB.token,
    method: 'POST',
    body: {
      name: 'BCA Nadia',
      accountType: 'bank',
      isShared: false,
      initialBalance: 2500000,
      icon: '🏦',
      color: '#C86446',
    },
  });
  const bankAcc = bankRes.account;
  assert.equal(bankAcc.ownerPartnerId, partnerB.partner.id);

  // Shared account forces ownerPartnerId = null even if provided
  const sharedRes = await req('/api/accounts', {
    token: partnerA.token,
    method: 'POST',
    body: {
      name: 'Tabungan Bersama',
      accountType: 'shared_savings',
      isShared: true,
      ownerPartnerId: partnerA.partner.id,
      initialBalance: 5000000,
      icon: '🐷',
    },
  });
  const sharedAcc = sharedRes.account;
  assert.equal(sharedAcc.isShared, true);
  assert.equal(sharedAcc.ownerPartnerId, null);
  assert.equal(sharedAcc.ownerPartnerName, null);

  const accList1 = await req('/api/accounts', { token: partnerA.token });
  assert.equal(accList1.accounts.length, 3);
  assert.equal(accList1.totals.totalBalance, 8500000);
  assert.equal(accList1.totals.sharedBalance, 5000000);
  assert.equal(accList1.totals.personalBalance, 3500000);

  // PATCH initialBalance delta updates balance
  const patchedCash = await req(`/api/accounts/${cashAcc.id}`, {
    token: partnerA.token,
    method: 'PATCH',
    body: { initialBalance: 1500000, name: 'Dompet Tunai Raka' },
  });
  assert.equal(patchedCash.account.initialBalance, 1500000);
  assert.equal(patchedCash.account.balance, 1500000);
  assert.equal(patchedCash.account.name, 'Dompet Tunai Raka');

  const accList2 = await req('/api/accounts', { token: partnerA.token });
  assert.equal(accList2.totals.totalBalance, 9000000);

  // ==========================================================================
  // Suite 4: Transactions, Legacy Null-Account, 5 Balance Transitions,
  //          Concurrent PATCH, Partner Preservation & tzOffset Boundaries
  // ==========================================================================
  // 4.1 Legacy transaction (null accountId)
  const legacyTxRes = await req('/api/transactions', {
    token: partnerA.token,
    method: 'POST',
    body: {
      categoryId: weddingCat.id,
      type: 'income',
      amount: 15000000,
      note: 'Gaji & bonus masuk dana nikah',
      occurredAt: '2026-11-10T10:00:00.000Z',
    },
  });
  const legacyTx = legacyTxRes.transaction;
  assert.equal(legacyTx.accountId, null);
  assert.equal(legacyTx.accountName, null);
  assert.equal(legacyTx.accountIcon, null);

  // Balances untouched by legacy tx
  const accCheckAfterLegacy = await req('/api/accounts', { token: partnerA.token });
  assert.equal(accCheckAfterLegacy.totals.totalBalance, 9000000);

  // 4.2 Account-linked income (+2,000,000 on Cash -> 3,500,000) & expense (-500,000 on Shared -> 4,500,000)
  const cashIncomeRes = await req('/api/transactions', {
    token: partnerA.token,
    method: 'POST',
    body: {
      categoryId: travelCat.id,
      accountId: cashAcc.id,
      type: 'income',
      amount: 2000000,
      note: 'Bonus proyek ke cash',
      occurredAt: '2026-11-11T08:00:00.000Z',
    },
  });
  const cashTx = cashIncomeRes.transaction;
  assert.equal(cashTx.accountId, cashAcc.id);
  assert.equal(cashTx.accountName, 'Dompet Tunai Raka');

  await req('/api/transactions', {
    token: partnerB.token,
    method: 'POST',
    body: {
      categoryId: weddingCat.id,
      accountId: sharedAcc.id,
      type: 'expense',
      amount: 500000,
      note: 'DP Dekorasi',
      occurredAt: '2026-11-12T08:00:00.000Z',
    },
  });

  let accState = await req('/api/accounts', { token: partnerA.token });
  assert.equal(accState.accounts.find((a) => a.id === cashAcc.id).balance, 3500000);
  assert.equal(accState.accounts.find((a) => a.id === sharedAcc.id).balance, 4500000);

  // 4.3 Transition A -> A (amount + type change)
  const patchAA = await req(`/api/transactions/${cashTx.id}`, {
    token: partnerB.token, // Partner B edits Partner A's transaction
    method: 'PATCH',
    body: { type: 'expense', amount: 1000000, note: 'Revisi jadi pengeluaran cash' },
  });
  // MUST preserve Partner A as original partnerId
  assert.equal(patchAA.transaction.partnerId, partnerA.partner.id);
  assert.equal(patchAA.transaction.accountId, cashAcc.id);
  accState = await req('/api/accounts', { token: partnerA.token });
  // Cash was 3,500,000 (had +2,000,000); now -1,000,000 => 1,500,000 - 1,000,000 = 500,000
  assert.equal(accState.accounts.find((a) => a.id === cashAcc.id).balance, 500000);

  // 4.4 Transition A -> B (Cash -> Bank)
  const patchAB = await req(`/api/transactions/${cashTx.id}`, {
    token: partnerB.token,
    method: 'PATCH',
    body: { accountId: bankAcc.id },
  });
  assert.equal(patchAB.transaction.accountId, bankAcc.id);
  assert.equal(patchAB.transaction.partnerId, partnerA.partner.id);
  accState = await req('/api/accounts', { token: partnerA.token });
  // Cash restored to 1,500,000; Bank (2,500,000) - 1,000,000 = 1,500,000
  assert.equal(accState.accounts.find((a) => a.id === cashAcc.id).balance, 1500000);
  assert.equal(accState.accounts.find((a) => a.id === bankAcc.id).balance, 1500000);

  // 4.5 Transition B -> null (detach)
  const patchBNull = await req(`/api/transactions/${cashTx.id}`, {
    token: partnerA.token,
    method: 'PATCH',
    body: { accountId: null },
  });
  assert.equal(patchBNull.transaction.accountId, null);
  accState = await req('/api/accounts', { token: partnerA.token });
  assert.equal(accState.accounts.find((a) => a.id === bankAcc.id).balance, 2500000);

  // 4.6 Transition null -> null (edit note/amount on unlinked tx)
  const patchNullNull = await req(`/api/transactions/${cashTx.id}`, {
    token: partnerA.token,
    method: 'PATCH',
    body: { note: 'Masih tanpa akun', amount: 1200000 },
  });
  assert.equal(patchNullNull.transaction.accountId, null);
  assert.equal(patchNullNull.transaction.amount, 1200000);

  // 4.7 Transition null -> A (attach to Cash)
  const patchNullA = await req(`/api/transactions/${cashTx.id}`, {
    token: partnerA.token,
    method: 'PATCH',
    body: { accountId: cashAcc.id },
  });
  assert.equal(patchNullA.transaction.accountId, cashAcc.id);
  accState = await req('/api/accounts', { token: partnerA.token });
  // Cash (1,500,000) - 1,200,000 = 300,000
  assert.equal(accState.accounts.find((a) => a.id === cashAcc.id).balance, 300000);

  // 4.8 DELETE transaction reverses account balance
  const delTxRes = await req(`/api/transactions/${cashTx.id}`, {
    token: partnerA.token,
    method: 'DELETE',
  });
  assert.equal(delTxRes.ok, true);
  assert.equal(delTxRes.id, cashTx.id);
  accState = await req('/api/accounts', { token: partnerA.token });
  assert.equal(accState.accounts.find((a) => a.id === cashAcc.id).balance, 1500000);

  // 4.9 Concurrent cross-account PATCH (A->B and B->A simultaneously) — no deadlock, exact balance sum
  const concTx1 = (
    await req('/api/transactions', {
      token: partnerA.token,
      method: 'POST',
      body: {
        categoryId: customCat.id,
        accountId: cashAcc.id,
        type: 'expense',
        amount: 200000,
        occurredAt: '2026-11-15T10:00:00.000Z',
      },
    })
  ).transaction;
  const concTx2 = (
    await req('/api/transactions', {
      token: partnerB.token,
      method: 'POST',
      body: {
        categoryId: customCat.id,
        accountId: bankAcc.id,
        type: 'expense',
        amount: 300000,
        occurredAt: '2026-11-15T10:05:00.000Z',
      },
    })
  ).transaction;

  const [swap1, swap2] = await Promise.all([
    req(`/api/transactions/${concTx1.id}`, { token: partnerA.token, method: 'PATCH', body: { accountId: bankAcc.id } }),
    req(`/api/transactions/${concTx2.id}`, { token: partnerB.token, method: 'PATCH', body: { accountId: cashAcc.id } }),
  ]);
  assert.equal(swap1.transaction.accountId, bankAcc.id);
  assert.equal(swap2.transaction.accountId, cashAcc.id);

  accState = await req('/api/accounts', { token: partnerA.token });
  // Cash started 1,500,000, now holds concTx2 (-300,000) => 1,200,000
  // Bank started 2,500,000, now holds concTx1 (-200,000) => 2,300,000
  assert.equal(accState.accounts.find((a) => a.id === cashAcc.id).balance, 1200000);
  assert.equal(accState.accounts.find((a) => a.id === bankAcc.id).balance, 2300000);

  // Clean up concTx1 & concTx2 so remaining fixtures stay crisp
  await req(`/api/transactions/${concTx1.id}`, { token: partnerA.token, method: 'DELETE' });
  await req(`/api/transactions/${concTx2.id}`, { token: partnerB.token, method: 'DELETE' });

  // 4.10 DELETE /api/accounts/:id preserves linked transaction history (accountId -> null)
  const tempAcc = (
    await req('/api/accounts', {
      token: partnerA.token,
      method: 'POST',
      body: { name: 'Dompet Sementara', accountType: 'ewallet', isShared: false, initialBalance: 300000 },
    })
  ).account;
  const tempTx = (
    await req('/api/transactions', {
      token: partnerA.token,
      method: 'POST',
      body: {
        categoryId: customCat.id,
        accountId: tempAcc.id,
        type: 'expense',
        amount: 100000,
        note: 'Kopi sebelum hapus dompet',
        occurredAt: '2026-11-16T05:00:00.000Z',
      },
    })
  ).transaction;

  const delAccRes = await req(`/api/accounts/${tempAcc.id}`, { token: partnerA.token, method: 'DELETE' });
  assert.equal(delAccRes.ok, true);
  assert.equal(delAccRes.id, tempAcc.id);

  const txAfterAccDel = await req('/api/transactions?month=2026-11&tzOffset=420', { token: partnerA.token });
  const preservedTempTx = txAfterAccDel.transactions.find((t) => t.id === tempTx.id);
  assert.ok(preservedTempTx, 'Transaction must remain after linked account deletion');
  assert.equal(preservedTempTx.accountId, null);
  assert.equal(preservedTempTx.accountName, null);
  assert.equal(preservedTempTx.accountIcon, null);

  // 4.11 tzOffset=420 (WIB) boundary timestamps + December rollover
  // 2026-10-31T18:00:00Z == 2026-11-01 01:00 WIB (November in WIB, October in UTC)
  // 2026-10-31T16:30:00Z == 2026-10-31 23:30 WIB (October in both WIB and UTC)
  const wibNovTx = (
    await req('/api/transactions', {
      token: partnerA.token,
      method: 'POST',
      body: {
        categoryId: homeCat.id,
        type: 'expense',
        amount: 250000,
        note: 'Beli galon tengah malam WIB',
        occurredAt: '2026-10-31T18:00:00.000Z',
      },
    })
  ).transaction;
  const wibOctTx = (
    await req('/api/transactions', {
      token: partnerB.token,
      method: 'POST',
      body: {
        categoryId: homeCat.id,
        type: 'expense',
        amount: 150000,
        note: 'Makan malam akhir Oktober WIB',
        occurredAt: '2026-10-31T16:30:00.000Z',
      },
    })
  ).transaction;

  const novWibList = await req('/api/transactions?month=2026-11&tzOffset=420', { token: partnerA.token });
  assert.ok(novWibList.transactions.some((t) => t.id === wibNovTx.id));
  assert.ok(!novWibList.transactions.some((t) => t.id === wibOctTx.id));

  const octWibList = await req('/api/transactions?month=2026-10&tzOffset=420', { token: partnerA.token });
  assert.ok(octWibList.transactions.some((t) => t.id === wibOctTx.id));
  assert.ok(!octWibList.transactions.some((t) => t.id === wibNovTx.id));

  const octUtcList = await req('/api/transactions?month=2026-10&tzOffset=0', { token: partnerA.token });
  assert.ok(octUtcList.transactions.some((t) => t.id === wibOctTx.id));
  assert.ok(octUtcList.transactions.some((t) => t.id === wibNovTx.id));

  // Query filters: accountId=none, accountId=<uuid>, type, partnerId
  const noneAccList = await req('/api/transactions?month=2026-11&tzOffset=420&accountId=none', { token: partnerA.token });
  assert.ok(noneAccList.transactions.every((t) => t.accountId === null));
  assert.ok(noneAccList.transactions.some((t) => t.id === legacyTx.id));
  assert.ok(noneAccList.transactions.some((t) => t.id === preservedTempTx.id));

  const sharedFilterList = await req(`/api/transactions?accountId=${sharedAcc.id}`, { token: partnerA.token });
  assert.equal(sharedFilterList.transactions.length, 1);

  // ==========================================================================
  // Suite 5: Budgets CRUD, POST & PUT Upsert, Expense-Only, Empty/Cross-Month
  // ==========================================================================
  const budgetPost = await req('/api/budgets', {
    token: partnerA.token,
    method: 'POST',
    body: { categoryId: homeCat.id, month: '2026-11', limitAmount: 1000000 },
  });
  assert.equal(budgetPost.budget.limitAmount, 1000000);

  // PUT /api/budgets upserts on (coupleId, categoryId, month) without creating a duplicate
  const budgetPut = await req('/api/budgets', {
    token: partnerB.token,
    method: 'PUT',
    body: { categoryId: homeCat.id, month: '2026-11', limitAmount: 500000 },
  });
  assert.equal(budgetPut.budget.id, budgetPost.budget.id);
  assert.equal(budgetPut.budget.limitAmount, 500000);

  // Record both income and expense in homeCat in 2026-11; spent must ONLY count expense
  await req('/api/transactions', {
    token: partnerA.token,
    method: 'POST',
    body: {
      categoryId: homeCat.id,
      type: 'income',
      amount: 900000,
      note: 'Cashback belanja rumah',
      occurredAt: '2026-11-18T05:00:00.000Z',
    },
  });
  await req('/api/transactions', {
    token: partnerB.token,
    method: 'POST',
    body: {
      categoryId: homeCat.id,
      type: 'expense',
      amount: 400000,
      note: 'Belanja bulanan',
      occurredAt: '2026-11-19T05:00:00.000Z',
    },
  });

  // In 2026-11 WIB, homeCat has wibNovTx (250,000) + 400,000 = 650,000 expense (over 500,000 limit)
  const novBudgets = await req('/api/budgets?month=2026-11&tzOffset=420', { token: partnerA.token });
  assert.equal(novBudgets.month, '2026-11');
  assert.equal(novBudgets.budgets.length, 1);
  assert.equal(novBudgets.budgets[0].spent, 650000);
  assert.equal(novBudgets.budgets[0].remaining, -150000);
  assert.equal(novBudgets.budgets[0].isOverBudget, true);
  assert.equal(novBudgets.budgets[0].progressPercent, 130);
  assert.equal(novBudgets.totalLimit, 500000);
  assert.equal(novBudgets.totalSpent, 650000);
  assert.equal(novBudgets.totalRemaining, -150000);

  // PATCH budget raises limit above spent
  const patchedBudget = await req(`/api/budgets/${budgetPost.budget.id}?tzOffset=420`, {
    token: partnerA.token,
    method: 'PATCH',
    body: { limitAmount: 1300000 },
  });
  assert.equal(patchedBudget.budget.limitAmount, 1300000);
  assert.equal(patchedBudget.budget.spent, 650000);
  assert.equal(patchedBudget.budget.remaining, 650000);
  assert.equal(patchedBudget.budget.isOverBudget, false);
  assert.equal(patchedBudget.budget.progressPercent, 50);

  // Cross-month isolation & empty month (2026-12)
  const decBudget = await req('/api/budgets', {
    token: partnerA.token,
    method: 'POST',
    body: { categoryId: travelCat.id, month: '2026-12', limitAmount: 2000000 },
  });
  const decBudgets = await req('/api/budgets?month=2026-12&tzOffset=420', { token: partnerA.token });
  assert.equal(decBudgets.budgets.length, 1);
  assert.equal(decBudgets.budgets[0].id, decBudget.budget.id);
  assert.equal(decBudgets.budgets[0].spent, 0);
  assert.equal(decBudgets.budgets[0].remaining, 2000000);
  assert.equal(decBudgets.budgets[0].isOverBudget, false);

  const delBudget = await req(`/api/budgets/${decBudget.budget.id}`, {
    token: partnerA.token,
    method: 'DELETE',
  });
  assert.equal(delBudget.ok, true);
  assert.equal(delBudget.id, decBudget.budget.id);

  // ==========================================================================
  // Suite 6: Summary (All-Time vs Monthly) & Analytics + Zero-Division Guard
  // ==========================================================================
  // 2026-11 (WIB) transactions:
  //   Income: legacyTx (15,000,000) + home income (900,000) = 15,900,000
  //   Expense: shared (500,000) + tempTx (100,000) + wibNovTx (250,000) + home expense (400,000) = 1,250,000
  // 2026-10 (WIB) transactions:
  //   Expense: wibOctTx (150,000)
  // All-time: Income 15,900,000, Expense 1,400,000, Net 14,500,000
  const allTimeSummary = await req('/api/summary', { token: partnerA.token });
  assert.equal(allTimeSummary.month, undefined);
  assert.equal(allTimeSummary.totalIncome, 15900000);
  assert.equal(allTimeSummary.totalExpense, 1400000);
  assert.equal(allTimeSummary.netBalance, 14500000);
  assert.equal(allTimeSummary.byPartner.length, 2);

  const novSummary = await req('/api/summary?month=2026-11&tzOffset=420', { token: partnerA.token });
  assert.equal(novSummary.month, '2026-11');
  assert.equal(novSummary.totalIncome, 15900000);
  assert.equal(novSummary.totalExpense, 1250000);
  assert.equal(novSummary.netBalance, 14650000);

  const novAnalytics = await req('/api/analytics?month=2026-11&tzOffset=420', { token: partnerA.token });
  assert.equal(novAnalytics.month, '2026-11');
  assert.equal(novAnalytics.totals.totalIncome, 15900000);
  assert.equal(novAnalytics.totals.totalExpense, 1250000);
  assert.equal(novAnalytics.totals.netBalance, 14650000);
  assert.equal(novAnalytics.totals.transactionCount, 6);
  assert.ok(Number.isFinite(novAnalytics.totals.savingsRate) && novAnalytics.totals.savingsRate > 0);
  assert.equal(novAnalytics.byPartner.length, 2);
  assert.equal(novAnalytics.byCategory.length, 5);
  assert.equal(novAnalytics.accountsOverview.accountsCount, 3);
  assert.equal(novAnalytics.accountsOverview.totalBalance, 8500000);
  assert.equal(novAnalytics.accountsOverview.sharedBalance, 4500000);
  assert.equal(novAnalytics.accountsOverview.personalBalance, 4000000);

  // Empty month zero-division guard
  const emptyAnalytics = await req('/api/analytics?month=2025-01&tzOffset=420', { token: partnerA.token });
  assert.equal(emptyAnalytics.totals.totalIncome, 0);
  assert.equal(emptyAnalytics.totals.totalExpense, 0);
  assert.equal(emptyAnalytics.totals.netBalance, 0);
  assert.equal(emptyAnalytics.totals.savingsRate, 0);
  assert.equal(emptyAnalytics.totals.transactionCount, 0);
  for (const c of emptyAnalytics.byCategory) {
    assert.equal(c.expensePercent, 0);
    assert.equal(c.incomePercent, 0);
  }

  // ==========================================================================
  // Suite 7: Auth (401), Validation (400) & Cross-Couple Isolation (404)
  // ==========================================================================
  // 401 checks
  assert.equal((await reqStatus('/api/accounts')).status, 401);
  assert.equal((await reqStatus('/api/accounts', { headers: { Authorization: 'Basic abc' } })).status, 401);
  assert.equal((await reqStatus('/api/budgets', { token: 'invalid-token-xyz' })).status, 401);

  // 400 checks (must return JSON 400 in both memory and PG)
  const badJson = await reqStatus('/api/accounts', {
    token: partnerA.token,
    method: 'POST',
    rawBody: '{bad json',
  });
  assert.equal(badJson.status, 400);
  assert.equal(typeof badJson.data.error, 'string');

  assert.equal((await reqStatus('/api/transactions/bad-uuid', { token: partnerA.token, method: 'DELETE' })).status, 400);
  assert.equal((await reqStatus('/api/transactions/bad-uuid', { token: partnerA.token, method: 'PATCH', body: { note: 'x' } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/bad-uuid', { token: partnerA.token, method: 'PATCH', body: { name: 'Valid' } })).status, 400);
  assert.equal((await reqStatus('/api/budgets/bad-uuid', { token: partnerA.token, method: 'DELETE' })).status, 400);
  assert.equal(
    (
      await reqStatus('/api/transactions', {
        token: partnerA.token,
        method: 'POST',
        body: { categoryId: weddingCat.id, type: 'transfer', amount: 1000 },
      })
    ).status,
    400
  );
  assert.equal(
    (
      await reqStatus('/api/transactions', {
        token: partnerA.token,
        method: 'POST',
        body: { categoryId: weddingCat.id, type: 'expense', amount: 0 },
      })
    ).status,
    400
  );
  assert.equal(
    (
      await reqStatus('/api/transactions', {
        token: partnerA.token,
        method: 'POST',
        body: { categoryId: weddingCat.id, type: 'expense', amount: 5000, occurredAt: 'not-a-date' },
      })
    ).status,
    400
  );
  assert.equal((await reqStatus('/api/transactions?month=2026-13', { token: partnerA.token })).status, 400);
  assert.equal((await reqStatus('/api/analytics?month=2026-1', { token: partnerA.token })).status, 400);
  assert.equal((await reqStatus('/api/analytics?tzOffset=notanumber', { token: partnerA.token })).status, 400);
  assert.equal(
    (
      await reqStatus('/api/accounts', {
        token: partnerA.token,
        method: 'POST',
        body: { name: 'Crypto', accountType: 'crypto', initialBalance: 0 },
      })
    ).status,
    400
  );
  assert.equal(
    (
      await reqStatus('/api/budgets', {
        token: partnerA.token,
        method: 'POST',
        body: { categoryId: homeCat.id, month: '2026-11', limitAmount: -50 },
      })
    ).status,
    400
  );

  // Unknown valid UUID -> 404
  const unknownUuid = '00000000-0000-4000-8000-000000000099';
  assert.equal((await reqStatus(`/api/accounts/${unknownUuid}`, { token: partnerA.token, method: 'DELETE' })).status, 404);
  assert.equal((await reqStatus(`/api/transactions/${unknownUuid}`, { token: partnerA.token, method: 'DELETE' })).status, 404);
  assert.equal((await reqStatus(`/api/budgets/${unknownUuid}`, { token: partnerA.token, method: 'DELETE' })).status, 404);

  // Cross-couple isolation (Couple 2 accessing Couple 1 resources -> 404, zero mutations)
  assert.equal(
    (
      await reqStatus(`/api/accounts/${cashAcc.id}`, {
        token: partnerC.token,
        method: 'PATCH',
        body: { name: 'Hijack' },
      })
    ).status,
    404
  );
  assert.equal((await reqStatus(`/api/accounts/${cashAcc.id}`, { token: partnerC.token, method: 'DELETE' })).status, 404);
  assert.equal(
    (
      await reqStatus(`/api/transactions/${legacyTx.id}`, {
        token: partnerC.token,
        method: 'PATCH',
        body: { amount: 1 },
      })
    ).status,
    404
  );
  assert.equal(
    (await reqStatus(`/api/transactions/${legacyTx.id}`, { token: partnerC.token, method: 'DELETE' })).status,
    404
  );
  assert.equal(
    (
      await reqStatus(`/api/budgets/${budgetPost.budget.id}`, {
        token: partnerC.token,
        method: 'PATCH',
        body: { limitAmount: 10 },
      })
    ).status,
    404
  );
  assert.equal(
    (
      await reqStatus('/api/transactions', {
        token: partnerC.token,
        method: 'POST',
        body: { categoryId: weddingCat.id, type: 'expense', amount: 1000 },
      })
    ).status,
    404
  );
  assert.equal(
    (
      await reqStatus('/api/notes', {
        token: partnerC.token,
        method: 'POST',
        body: { title: 'Cross Note', categoryId: weddingCat.id },
      })
    ).status,
    404
  );

  // Verify Couple 1 data remained completely intact
  const finalCheck = await req('/api/analytics?month=2026-11&tzOffset=420', { token: partnerA.token });
  assert.equal(finalCheck.totals.totalIncome, 15900000);
  assert.equal(finalCheck.totals.totalExpense, 1250000);

  // ==========================================================================
  // Suite 8: M4 Continuation — Notes CRUD, Categories Edit/409, Transfers,
  //          Couple Profile Edit & Monthly Export (CSV/JSON)
  // ==========================================================================
  // 8.1 Notes PATCH / DELETE + validation + cross-couple 404
  const patchedNote = await req(`/api/notes/${createdNote.id}`, {
    token: partnerA.token,
    method: 'PATCH',
    body: { title: 'Checklist Vendor Final', content: 'Semua vendor lunas', isPinned: false, categoryId: null },
  });
  assert.equal(patchedNote.title, 'Checklist Vendor Final');
  assert.equal(patchedNote.content, 'Semua vendor lunas');
  assert.equal(patchedNote.isPinned, false);
  assert.equal(patchedNote.categoryId, null);

  assert.equal((await reqStatus('/api/notes/bad-uuid', { token: partnerA.token, method: 'PATCH', body: { title: 'Valid' } })).status, 400);
  assert.equal((await reqStatus(`/api/notes/${createdNote.id}`, { token: partnerA.token, method: 'PATCH', body: { title: 'A' } })).status, 400);
  assert.equal((await reqStatus(`/api/notes/${createdNote.id}`, { token: partnerC.token, method: 'PATCH', body: { title: 'Hack' } })).status, 404);
  assert.equal((await reqStatus(`/api/notes/${createdNote.id}`, { token: partnerC.token, method: 'DELETE' })).status, 404);

  const noteToDelete = await req('/api/notes', {
    token: partnerA.token,
    method: 'POST',
    body: { title: 'Catatan Sementara', content: 'Hapus nanti', isPinned: true },
  });
  const delNoteRes = await req(`/api/notes/${noteToDelete.id}`, { token: partnerB.token, method: 'DELETE' });
  assert.equal(delNoteRes.ok, true);
  assert.equal(delNoteRes.id, noteToDelete.id);
  assert.equal((await reqStatus(`/api/notes/${noteToDelete.id}`, { token: partnerA.token, method: 'DELETE' })).status, 404);

  // 8.2 Categories PATCH / DELETE + 409 guard for tx, budget, and note references
  const patchedCustomCat = await req(`/api/categories/${customCat.id}`, {
    token: partnerA.token,
    method: 'PATCH',
    body: { name: 'Cicilan Rumah Baru', icon: '🏘️', targetAmount: 300000000 },
  });
  assert.equal(patchedCustomCat.name, 'Cicilan Rumah Baru');
  assert.equal(patchedCustomCat.icon, '🏘️');
  assert.equal(patchedCustomCat.targetAmount, 300000000);
  assert.equal((await reqStatus('/api/categories/bad-uuid', { token: partnerA.token, method: 'PATCH', body: { name: 'Valid' } })).status, 400);
  assert.equal((await reqStatus(`/api/categories/${customCat.id}`, { token: partnerA.token, method: 'PATCH', body: { targetAmount: -1 } })).status, 400);
  assert.equal((await reqStatus(`/api/categories/${customCat.id}`, { token: partnerA.token, method: 'PATCH', body: { targetAmount: '   ' } })).status, 400);
  assert.equal((await reqStatus(`/api/categories/${customCat.id}`, { token: partnerA.token, method: 'PATCH', body: { targetAmount: true } })).status, 400);
  assert.equal((await reqStatus(`/api/categories/${customCat.id}`, { token: partnerA.token, method: 'PATCH', body: { targetAmount: false } })).status, 400);
  assert.equal((await reqStatus(`/api/categories/${customCat.id}`, { token: partnerA.token, method: 'PATCH', body: { targetAmount: [] } })).status, 400);
  assert.equal((await reqStatus(`/api/categories/${customCat.id}`, { token: partnerC.token, method: 'PATCH', body: { name: 'Hijack' } })).status, 404);

  // customCat is referenced by tempTx (Suite 4) -> 409
  assert.equal((await reqStatus(`/api/categories/${customCat.id}`, { token: partnerA.token, method: 'DELETE' })).status, 409);

  // Create fresh category -> test 409 when referenced by budget, then note, then delete cleanly
  const refCat = await req('/api/categories', {
    token: partnerA.token,
    method: 'POST',
    body: { name: 'Pos Uji Guard', icon: '🧪', targetAmount: 1000000 },
  });
  const refBudget = (
    await req('/api/budgets', {
      token: partnerA.token,
      method: 'POST',
      body: { categoryId: refCat.id, month: '2026-11', limitAmount: 500000 },
    })
  ).budget;
  assert.equal((await reqStatus(`/api/categories/${refCat.id}`, { token: partnerA.token, method: 'DELETE' })).status, 409);
  await req(`/api/budgets/${refBudget.id}`, { token: partnerA.token, method: 'DELETE' });

  const refNote = await req('/api/notes', {
    token: partnerA.token,
    method: 'POST',
    body: { title: 'Note Guard Pos', categoryId: refCat.id },
  });
  assert.equal((await reqStatus(`/api/categories/${refCat.id}`, { token: partnerA.token, method: 'DELETE' })).status, 409);
  await req(`/api/notes/${refNote.id}`, { token: partnerA.token, method: 'DELETE' });

  assert.equal((await reqStatus(`/api/categories/${refCat.id}`, { token: partnerC.token, method: 'DELETE' })).status, 404);
  const delRefCat = await req(`/api/categories/${refCat.id}`, { token: partnerA.token, method: 'DELETE' });
  assert.equal(delRefCat.ok, true);
  assert.equal(delRefCat.id, refCat.id);
  assert.equal((await reqStatus(`/api/categories/${refCat.id}`, { token: partnerA.token, method: 'DELETE' })).status, 404);

  // 8.3 Atomic Wallet-to-Wallet Transfer + non-inflation + concurrent bidirectional + 400/404
  // Currently: cashAcc = 1,500,000 (personal), bankAcc = 2,500,000 (personal), sharedAcc = 4,500,000 (shared), total = 8,500,000
  const trRes = await req('/api/accounts/transfer', {
    token: partnerA.token,
    method: 'POST',
    body: {
      fromAccountId: cashAcc.id,
      toAccountId: sharedAcc.id,
      amount: 500000,
      note: 'Setor ke tabungan bersama',
      occurredAt: '2026-11-20T09:00:00.000Z',
    },
  });
  assert.equal(trRes.fromAccount.balance, 1000000);
  assert.equal(trRes.toAccount.balance, 5000000);
  assert.equal(trRes.totals.totalBalance, 8500000);
  assert.equal(trRes.totals.sharedBalance, 5000000);
  assert.equal(trRes.totals.personalBalance, 3500000);

  // Concurrent bidirectional transfers conserve exact sum
  await Promise.all([
    req('/api/accounts/transfer', {
      token: partnerA.token,
      method: 'POST',
      body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: 200000, occurredAt: '2026-11-20T10:00:00.000Z' },
    }),
    req('/api/accounts/transfer', {
      token: partnerB.token,
      method: 'POST',
      body: { fromAccountId: bankAcc.id, toAccountId: cashAcc.id, amount: 100000, occurredAt: '2026-11-20T10:05:00.000Z' },
    }),
  ]);
  const accAfterTransfers = await req('/api/accounts', { token: partnerA.token });
  assert.equal(accAfterTransfers.accounts.find((a) => a.id === cashAcc.id).balance, 900000);
  assert.equal(accAfterTransfers.accounts.find((a) => a.id === bankAcc.id).balance, 2600000);
  assert.equal(accAfterTransfers.totals.totalBalance, 8500000);

  const transferList = await req('/api/accounts/transfers?month=2026-11&tzOffset=420', { token: partnerA.token });
  assert.equal(transferList.transfers.length, 3);

  // Verify summary, analytics, and budgets totals remain completely uninflated
  const sumAfterTransfer = await req('/api/summary?month=2026-11&tzOffset=420', { token: partnerA.token });
  assert.equal(sumAfterTransfer.totalIncome, 15900000);
  assert.equal(sumAfterTransfer.totalExpense, 1250000);
  const anaAfterTransfer = await req('/api/analytics?month=2026-11&tzOffset=420', { token: partnerA.token });
  assert.equal(anaAfterTransfer.totals.totalIncome, 15900000);
  assert.equal(anaAfterTransfer.totals.totalExpense, 1250000);
  assert.equal(anaAfterTransfer.totals.transactionCount, 6);

  // Transfer validation 400 & cross-couple 404
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: cashAcc.id, amount: 10000 } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: 0 } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: -5000 } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: 999999999 } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: 1000, date: 'invalid' } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: true } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: false } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: [] } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: '   ' } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: 1000, occurredAt: '' } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: 1000, occurredAt: null } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: 1000, date: '' } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerA.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: 1000, date: null } })).status, 400);
  assert.equal((await reqStatus('/api/accounts/transfer', { token: partnerC.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: bankAcc.id, amount: 10000 } })).status, 404);

  // 8.4 Couple Profile PATCH + Dynamic Note Author Hydration
  assert.equal((await reqStatus('/api/couple', { method: 'PATCH', body: { coupleName: 'No Auth' } })).status, 401);
  assert.equal((await reqStatus('/api/couple', { token: partnerA.token, method: 'PATCH', body: {} })).status, 400);
  assert.equal((await reqStatus('/api/couple', { token: partnerA.token, method: 'PATCH', body: { coupleName: 'X' } })).status, 400);
  assert.equal((await reqStatus('/api/couple', { token: partnerA.token, method: 'PATCH', body: { partnerName: 'Y' } })).status, 400);

  const patchedCoupleA = await req('/api/couple', {
    token: partnerA.token,
    method: 'PATCH',
    body: { coupleName: 'Dompet Impian Berdua', partnerName: 'Raka Pratama' },
  });
  assert.equal(patchedCoupleA.couple.coupleName, 'Dompet Impian Berdua');
  assert.equal(patchedCoupleA.partner.name, 'Raka Pratama');

  // Partner B renames self without mutating Partner A
  const patchedCoupleB = await req('/api/couple', {
    token: partnerB.token,
    method: 'PATCH',
    body: { partnerName: 'Nadia Putri' },
  });
  assert.equal(patchedCoupleB.partner.name, 'Nadia Putri');
  const coupleAfterRename = await req('/api/couple', { token: partnerA.token });
  assert.equal(coupleAfterRename.partners.find((p) => p.id === partnerA.partner.id).name, 'Raka Pratama');
  assert.equal(coupleAfterRename.partners.find((p) => p.id === partnerB.partner.id).name, 'Nadia Putri');

  // Dynamic note authorName hydration reflects Nadia's rename
  const notesAfterRename = await req('/api/notes', { token: partnerA.token });
  assert.equal(notesAfterRename.find((n) => n.id === createdNote.id).authorName, 'Nadia Putri');

  // 8.5 Monthly Export (JSON & CSV)
  const exportJson = await req('/api/export?month=2026-11&tzOffset=420&format=json', { token: partnerA.token });
  assert.equal(exportJson.month, '2026-11');
  assert.equal(exportJson.couple.coupleName, 'Dompet Impian Berdua');
  assert.equal(exportJson.summary.totalIncome, 15900000);
  assert.equal(exportJson.summary.totalExpense, 1250000);
  assert.equal(exportJson.transactions.length, 6);
  assert.equal(exportJson.transfers.length, 3);

  const exportCsv = await reqStatus('/api/export?month=2026-11&tzOffset=420&format=csv', { token: partnerA.token });
  assert.equal(exportCsv.status, 200);
  assert.ok(String(exportCsv.data).startsWith('Tanggal,Tipe,Kategori,Dompet,Pasangan,Nominal,Catatan'));
  assert.ok(String(exportCsv.data).includes('Raka Pratama'));
  assert.equal((await reqStatus('/api/export?month=2026-11&format=xml', { token: partnerA.token })).status, 400);

  // 8.6 CSV Formula Injection (CWE-1236) neutralization & RFC-4180 parity (server & src/utils/export.ts)
  const csvSafetyCouple = await req('/api/couples/create', {
    method: 'POST',
    body: { coupleName: 'CSV Safety Couple', partnerName: 'Sari' },
  });
  createdCoupleIds.push(csvSafetyCouple.couple.id);
  const csvCats = await req('/api/categories', { token: csvSafetyCouple.token });
  const csvCatId = csvCats[0].id;
  const csvTestNotes = [
    { amount: 1000, note: "=CMD|'/C calc'!A0" },
    { amount: 2000, note: '+SUM(1,2)' },
    { amount: 3000, note: '-1+1' },
    { amount: 4000, note: '@SUM(1,1)' },
    { amount: 5000, note: '  =1+1' },
    { amount: 6000, note: '\t=1+1' },
    { amount: 7000, note: 'Makan, "Spesial"\nBaris 2\r\nBaris 3' },
    { amount: 8000, note: '\n=1+1' },
  ];
  const formulaCat = await req('/api/categories', {
    token: csvSafetyCouple.token,
    method: 'POST',
    body: { name: '=HYPERLINK("http://evil.example","Klik")', icon: '⚠️', targetAmount: 0 },
  });
  await req('/api/transactions', {
    token: csvSafetyCouple.token,
    method: 'POST',
    body: {
      categoryId: formulaCat.id,
      type: 'expense',
      amount: 9000,
      note: 'Kategori formula',
      occurredAt: '2026-11-18T10:00:00.000Z',
    },
  });
  for (let i = 0; i < csvTestNotes.length; i += 1) {
    await req('/api/transactions', {
      token: csvSafetyCouple.token,
      method: 'POST',
      body: {
        categoryId: csvCatId,
        type: 'expense',
        amount: csvTestNotes[i].amount,
        note: csvTestNotes[i].note,
        occurredAt: `2026-11-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`,
      },
    });
  }
  const safeCsvRes = await reqStatus('/api/export?month=2026-11&tzOffset=420&format=csv', {
    token: csvSafetyCouple.token,
  });
  assert.equal(safeCsvRes.status, 200);
  const safeCsvText = String(safeCsvRes.data);
  assert.ok(safeCsvText.includes(",1000,'=CMD|'/C calc'!A0"));
  assert.ok(safeCsvText.includes(',2000,"\'+SUM(1,2)"'));
  assert.ok(safeCsvText.includes(",3000,'-1+1"));
  assert.ok(safeCsvText.includes(',4000,"\'@SUM(1,1)"'));
  assert.ok(safeCsvText.includes(",5000,'  =1+1"));
  assert.ok(safeCsvText.includes(",6000,'\t=1+1"));
  assert.ok(safeCsvText.includes(',7000,"Makan, ""Spesial""\nBaris 2\r\nBaris 3"'));
  assert.ok(safeCsvText.includes(',8000,"\'\n=1+1"'));
  assert.ok(safeCsvText.includes('"\'=HYPERLINK(""http://evil.example"",""Klik"")"'));

  const exportTsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/export.ts');
  const exportTsCompiled = ts.transpileModule(readFileSync(exportTsPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exportMod = { exports: {} };
  const stubRequire = (id) => {
    if (id === 'react-native') return { Platform: { OS: 'web' }, Share: {} };
    if (id === 'expo-file-system') return { File: class {}, Paths: {} };
    throw new Error(`Unexpected import in src/utils/export.ts: ${id}`);
  };
  new Function('exports', 'require', 'module', exportTsCompiled)(exportMod.exports, stubRequire, exportMod);
  const clientEscapeCsvCell = exportMod.exports.escapeCsvCell;
  assert.equal(clientEscapeCsvCell("=CMD|'/C calc'!A0"), "'=CMD|'/C calc'!A0");
  assert.equal(clientEscapeCsvCell('+SUM(1,2)'), '"\'+SUM(1,2)"');
  assert.equal(clientEscapeCsvCell('-1+1'), "'-1+1");
  assert.equal(clientEscapeCsvCell('@SUM(1,1)'), '"\'@SUM(1,1)"');
  assert.equal(clientEscapeCsvCell('  =1+1'), "'  =1+1");
  assert.equal(clientEscapeCsvCell('\t=1+1'), "'\t=1+1");
  assert.equal(clientEscapeCsvCell('\rfoo'), '"\'\rfoo"');
  assert.equal(clientEscapeCsvCell('\n=1+1'), '"\'\n=1+1"');
  assert.equal(clientEscapeCsvCell('\nfoo'), '"\'\nfoo"');
  assert.equal(clientEscapeCsvCell('Makan, "Spesial"\nBaris 2\r\nBaris 3'), '"Makan, ""Spesial""\nBaris 2\r\nBaris 3"');
  assert.equal(clientEscapeCsvCell(12345), '12345');
  assert.equal(clientEscapeCsvCell(null), '');
  assert.equal(clientEscapeCsvCell(undefined), '');

  // 8.7 Tier 5 White-Box Adversarial Checks (Strict Numerics, Boundary Transfers, Unlinking, Couple Alias)
  const advCouple = await req('/api/couples/create', {
    method: 'POST',
    body: { coupleName: 'Adversarial Couple', partnerName: 'Dina' },
  });
  createdCoupleIds.push(advCouple.couple.id);
  const advCats = await req('/api/categories', { token: advCouple.token });
  const advCatDefault = advCats[0];
  const advAccA = (
    await req('/api/accounts', {
      token: advCouple.token,
      method: 'POST',
      body: { name: 'Dompet Adv A', accountType: 'cash', isShared: false, initialBalance: 50000 },
    })
  ).account;
  const advAccB = (
    await req('/api/accounts', {
      token: advCouple.token,
      method: 'POST',
      body: { name: 'Bank Adv B', accountType: 'bank', isShared: true, initialBalance: 100000 },
    })
  ).account;
  const advTx = (
    await req('/api/transactions', {
      token: advCouple.token,
      method: 'POST',
      body: { categoryId: advCatDefault.id, type: 'expense', amount: 10000, occurredAt: '2026-11-12T10:00:00.000Z' },
    })
  ).transaction;
  const advBudget = (
    await req('/api/budgets', {
      token: advCouple.token,
      method: 'POST',
      body: { categoryId: advCatDefault.id, month: '2026-11', limitAmount: 500000 },
    })
  ).budget;

  // Strict numeric coercion rejections across all numeric endpoints
  const badNums = [true, false, null, [], {}, '', '   '];
  for (const badVal of badNums) {
    assert.equal(
      (await reqStatus('/api/categories', { token: advCouple.token, method: 'POST', body: { name: 'BadCat', targetAmount: badVal } })).status,
      400,
      `POST /api/categories should reject targetAmount=${JSON.stringify(badVal)}`
    );
    assert.equal(
      (await reqStatus(`/api/categories/${advCatDefault.id}`, { token: advCouple.token, method: 'PATCH', body: { targetAmount: badVal } })).status,
      400,
      `PATCH /api/categories/:id should reject targetAmount=${JSON.stringify(badVal)}`
    );
    assert.equal(
      (await reqStatus('/api/accounts', { token: advCouple.token, method: 'POST', body: { name: 'BadAcc', accountType: 'cash', initialBalance: badVal } })).status,
      400,
      `POST /api/accounts should reject initialBalance=${JSON.stringify(badVal)}`
    );
    assert.equal(
      (await reqStatus(`/api/accounts/${advAccA.id}`, { token: advCouple.token, method: 'PATCH', body: { initialBalance: badVal } })).status,
      400,
      `PATCH /api/accounts/:id should reject initialBalance=${JSON.stringify(badVal)}`
    );
    assert.equal(
      (await reqStatus('/api/transactions', { token: advCouple.token, method: 'POST', body: { categoryId: advCatDefault.id, type: 'expense', amount: badVal } })).status,
      400,
      `POST /api/transactions should reject amount=${JSON.stringify(badVal)}`
    );
    assert.equal(
      (await reqStatus(`/api/transactions/${advTx.id}`, { token: advCouple.token, method: 'PATCH', body: { amount: badVal } })).status,
      400,
      `PATCH /api/transactions/:id should reject amount=${JSON.stringify(badVal)}`
    );
    assert.equal(
      (await reqStatus('/api/budgets', { token: advCouple.token, method: 'POST', body: { categoryId: advCatDefault.id, month: '2026-11', limitAmount: badVal } })).status,
      400,
      `POST /api/budgets should reject limitAmount=${JSON.stringify(badVal)}`
    );
    assert.equal(
      (await reqStatus('/api/budgets', { token: advCouple.token, method: 'PUT', body: { categoryId: advCatDefault.id, month: '2026-11', limitAmount: badVal } })).status,
      400,
      `PUT /api/budgets should reject limitAmount=${JSON.stringify(badVal)}`
    );
    assert.equal(
      (await reqStatus(`/api/budgets/${advBudget.id}`, { token: advCouple.token, method: 'PATCH', body: { limitAmount: badVal } })).status,
      400,
      `PATCH /api/budgets/:id should reject limitAmount=${JSON.stringify(badVal)}`
    );
    assert.equal(
      (await reqStatus('/api/accounts/transfer', { token: advCouple.token, method: 'POST', body: { fromAccountId: advAccA.id, toAccountId: advAccB.id, amount: badVal } })).status,
      400,
      `POST /api/accounts/transfer should reject amount=${JSON.stringify(badVal)}`
    );
  }
  // Omitted optional numeric fields still default to 0 cleanly
  const catOmittedTarget = await req('/api/categories', {
    token: advCouple.token,
    method: 'POST',
    body: { name: 'Tanpa Target' },
  });
  assert.equal(catOmittedTarget.targetAmount, 0);
  const accOmittedBalance = (
    await req('/api/accounts', {
      token: advCouple.token,
      method: 'POST',
      body: { name: 'Saldo Kosong', accountType: 'cash' },
    })
  ).account;
  assert.equal(accOmittedBalance.initialBalance, 0);

  // Sub-cent rounding (0.004 -> 0 -> 400), over-balance by 0.01 (400), cross-couple partial ownership (404)
  assert.equal(
    (await reqStatus('/api/accounts/transfer', { token: advCouple.token, method: 'POST', body: { fromAccountId: advAccA.id, toAccountId: advAccB.id, amount: 0.004 } })).status,
    400
  );
  assert.equal(
    (await reqStatus('/api/accounts/transfer', { token: advCouple.token, method: 'POST', body: { fromAccountId: advAccA.id, toAccountId: advAccB.id, amount: 50000.01 } })).status,
    400
  );
  assert.equal(
    (await reqStatus('/api/accounts/transfer', { token: advCouple.token, method: 'POST', body: { fromAccountId: advAccA.id, toAccountId: cashAcc.id, amount: 1000 } })).status,
    404
  );
  assert.equal(
    (await reqStatus('/api/accounts/transfer', { token: advCouple.token, method: 'POST', body: { fromAccountId: cashAcc.id, toAccountId: advAccB.id, amount: 1000 } })).status,
    404
  );

  // Exact full-balance transfer (50000 -> fromAccount.balance === 0) on WIB month boundary
  const exactTransfer = await req('/api/accounts/transfer', {
    token: advCouple.token,
    method: 'POST',
    body: {
      fromAccountId: advAccA.id,
      toAccountId: advAccB.id,
      amount: 50000,
      note: 'Pindah semua saldo',
      occurredAt: '2026-10-31T18:00:00.000Z',
    },
  });
  assert.equal(exactTransfer.fromAccount.balance, 0);
  assert.equal(exactTransfer.toAccount.balance, 150000);

  const novTransfersWib = await req('/api/accounts/transfers?month=2026-11&tzOffset=420', { token: advCouple.token });
  assert.equal(novTransfersWib.transfers.length, 1);
  const octTransfersWib = await req('/api/accounts/transfers?month=2026-10&tzOffset=420', { token: advCouple.token });
  assert.equal(octTransfersWib.transfers.length, 0);
  const octTransfersUtc = await req('/api/accounts/transfers?month=2026-10&tzOffset=0', { token: advCouple.token });
  assert.equal(octTransfersUtc.transfers.length, 1);

  // Delete source account -> transfer history preserved with fromAccountId=null & export JSON 200
  await req(`/api/accounts/${advAccA.id}`, { token: advCouple.token, method: 'DELETE' });
  const advExportJson = await req('/api/export?month=2026-11&tzOffset=420&format=json', { token: advCouple.token });
  assert.equal(advExportJson.transfers.length, 1);
  assert.equal(advExportJson.transfers[0].fromAccountId, null);
  assert.equal(advExportJson.transfers[0].toAccountId, advAccB.id);

  // PATCH /api/notes/:id cross-couple categoryId (404) + note unlinking unblocking DELETE /api/categories/:id
  const unlinkCat = await req('/api/categories', {
    token: advCouple.token,
    method: 'POST',
    body: { name: 'Kategori Unlink' },
  });
  const linkedNote = await req('/api/notes', {
    token: advCouple.token,
    method: 'POST',
    body: { title: 'Note Terkait', categoryId: unlinkCat.id },
  });
  assert.equal(
    (await reqStatus(`/api/notes/${linkedNote.id}`, { token: advCouple.token, method: 'PATCH', body: { categoryId: weddingCat.id } })).status,
    404
  );
  assert.equal((await reqStatus(`/api/categories/${unlinkCat.id}`, { token: advCouple.token, method: 'DELETE' })).status, 409);
  const unlinkedNote = await req(`/api/notes/${linkedNote.id}`, {
    token: advCouple.token,
    method: 'PATCH',
    body: { categoryId: null },
  });
  assert.equal(unlinkedNote.categoryId, null);
  assert.equal((await req(`/api/categories/${unlinkCat.id}`, { token: advCouple.token, method: 'DELETE' })).ok, true);

  // PATCH /api/couple name alias & partial updates
  const aliasRes = await req('/api/couple', {
    token: advCouple.token,
    method: 'PATCH',
    body: { name: 'Dina Larasati' },
  });
  assert.equal(aliasRes.partner.name, 'Dina Larasati');
  assert.equal(aliasRes.couple.coupleName, 'Adversarial Couple');
  const coupleOnlyRes = await req('/api/couple', {
    token: advCouple.token,
    method: 'PATCH',
    body: { coupleName: 'Dompet Dina' },
  });
  assert.equal(coupleOnlyRes.couple.coupleName, 'Dompet Dina');
  assert.equal(coupleOnlyRes.partner.name, 'Dina Larasati');

  console.log(
    JSON.stringify(
      {
        ok: true,
        storage: health.storage,
        suitesPassed: 8,
        novSummary: {
          totalIncome: novSummary.totalIncome,
          totalExpense: novSummary.totalExpense,
          netBalance: novSummary.netBalance,
        },
        accountsOverview: novAnalytics.accountsOverview,
        notesCount: notesAfterRename.length,
        transfersCount: transferList.transfers.length,
      },
      null,
      2
    )
  );
} finally {
  for (const cid of createdCoupleIds) {
    await cleanupCouple(cid).catch((err) => console.error('cleanupCouple warning:', err.message));
  }
  await stopServer(server);
}
