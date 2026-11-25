import assert from 'node:assert/strict';
import http from 'node:http';
import handler from '../api/[[...path]].mjs';
import { parseIdrInput } from '../src/utils/format.ts';

async function fetchJson(baseUrl, path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, headers: res.headers, data };
}

const server = http.createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch((err) => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  // 1. /api/health returns 200 ok: true
  const health = await fetchJson(baseUrl, '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data?.ok, true);
  assert.equal(health.data?.storage, 'memory');

  // 2. /api/couples/create (201) -> /api/couple (200)
  const created = await fetchJson(baseUrl, '/api/couples/create', {
    method: 'POST',
    body: { coupleName: 'Vercel Couple', partnerName: 'Raka' },
  });
  assert.equal(created.status, 201);
  assert.ok(created.data?.token);
  assert.equal(created.data?.couple?.coupleName, 'Vercel Couple');

  const couple = await fetchJson(baseUrl, '/api/couple', { token: created.data.token });
  assert.equal(couple.status, 200);
  assert.equal(couple.data?.id, created.data.couple.id);
  assert.equal(couple.data?.partners?.length, 1);

  // 3. Unknown /api route returns JSON 404
  const notFound = await fetchJson(baseUrl, '/api/does-not-exist');
  assert.equal(notFound.status, 404);
  assert.equal(typeof notFound.data?.error, 'string');

  // 4. Verify parseIdrInput decimal/IDR suffix handling
  assert.equal(parseIdrInput('50000.00'), 50000);
  assert.equal(parseIdrInput('50000,50'), 50000);
  assert.equal(parseIdrInput('Rp 25.000,-'), 25000);
  assert.equal(parseIdrInput('1.500.000'), 1500000);
  assert.equal(parseIdrInput('abc'), 0);

  // 5. M4 routes via Vercel adapter: PATCH /api/couple, Notes CRUD, Categories PATCH/DELETE+409,
  //    Account Transfer, Export CSV/JSON, and strict numeric 400 validation
  const token = created.data.token;
  const patchedCouple = await fetchJson(baseUrl, '/api/couple', {
    method: 'PATCH',
    token,
    body: { coupleName: 'Vercel Couple Updated', name: 'Raka V2' },
  });
  assert.equal(patchedCouple.status, 200);
  assert.equal(patchedCouple.data?.couple?.coupleName, 'Vercel Couple Updated');
  assert.equal(patchedCouple.data?.partner?.name, 'Raka V2');

  const customCat = await fetchJson(baseUrl, '/api/categories', {
    method: 'POST',
    token,
    body: { name: 'Liburan Vercel', icon: '🏖️', targetAmount: 5000000 },
  });
  assert.equal(customCat.status, 201);
  const patchedCat = await fetchJson(baseUrl, `/api/categories/${customCat.data.id}`, {
    method: 'PATCH',
    token,
    body: { name: 'Liburan Bali', targetAmount: 7500000 },
  });
  assert.equal(patchedCat.status, 200);
  assert.equal(patchedCat.data?.name, 'Liburan Bali');

  const createdNote = await fetchJson(baseUrl, '/api/notes', {
    method: 'POST',
    token,
    body: { title: 'Booking Hotel', content: 'Ubud', categoryId: customCat.data.id, isPinned: true },
  });
  assert.equal(createdNote.status, 201);

  // Category referenced by note -> 409 on DELETE
  const cat409 = await fetchJson(baseUrl, `/api/categories/${customCat.data.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(cat409.status, 409);

  const patchedNote = await fetchJson(baseUrl, `/api/notes/${createdNote.data.id}`, {
    method: 'PATCH',
    token,
    body: { title: 'Booking Villa', categoryId: null, isPinned: false },
  });
  assert.equal(patchedNote.status, 200);
  assert.equal(patchedNote.data?.title, 'Booking Villa');
  assert.equal(patchedNote.data?.categoryId, null);

  const delCat = await fetchJson(baseUrl, `/api/categories/${customCat.data.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(delCat.status, 200);
  assert.equal(delCat.data?.ok, true);

  const delNote = await fetchJson(baseUrl, `/api/notes/${createdNote.data.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(delNote.status, 200);
  assert.equal(delNote.data?.ok, true);

  const acc1 = await fetchJson(baseUrl, '/api/accounts', {
    method: 'POST',
    token,
    body: { name: 'Cash Vercel', accountType: 'cash', initialBalance: 200000 },
  });
  const acc2 = await fetchJson(baseUrl, '/api/accounts', {
    method: 'POST',
    token,
    body: { name: 'Bank Vercel', accountType: 'bank', isShared: true, initialBalance: 100000 },
  });
  assert.equal(acc1.status, 201);
  assert.equal(acc2.status, 201);

  const badTransfer = await fetchJson(baseUrl, '/api/accounts/transfer', {
    method: 'POST',
    token,
    body: { fromAccountId: acc1.data.account.id, toAccountId: acc2.data.account.id, amount: true },
  });
  assert.equal(badTransfer.status, 400);

  const transferRes = await fetchJson(baseUrl, '/api/accounts/transfer', {
    method: 'POST',
    token,
    body: {
      fromAccountId: acc1.data.account.id,
      toAccountId: acc2.data.account.id,
      amount: 50000,
      note: 'Topup bank',
      occurredAt: '2026-11-15T10:00:00.000Z',
    },
  });
  assert.equal(transferRes.status, 201);
  assert.equal(transferRes.data?.fromAccount?.balance, 150000);
  assert.equal(transferRes.data?.toAccount?.balance, 150000);

  const cats = await fetchJson(baseUrl, '/api/categories', { token });
  const txRes = await fetchJson(baseUrl, '/api/transactions', {
    method: 'POST',
    token,
    body: {
      categoryId: cats.data[0].id,
      type: 'expense',
      amount: 10000,
      note: '\n=1+1',
      occurredAt: '2026-11-15T11:00:00.000Z',
    },
  });
  assert.equal(txRes.status, 201);

  const exportCsv = await fetchJson(baseUrl, '/api/export?month=2026-11&tzOffset=420&format=csv', { token });
  assert.equal(exportCsv.status, 200);
  assert.ok(String(exportCsv.data).includes('"\'\n=1+1"'));

  const exportJson = await fetchJson(baseUrl, '/api/export?month=2026-11&tzOffset=420&format=json', { token });
  assert.equal(exportJson.status, 200);
  assert.equal(exportJson.data?.transfers?.length, 1);
  assert.equal(exportJson.data?.transactions?.length, 1);

  console.log(
    JSON.stringify(
      {
        ok: true,
        adapter: 'vercel-serverless',
        storage: health.data.storage,
        checksPassed: 5,
      },
      null,
      2
    )
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
