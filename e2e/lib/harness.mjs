// Opaque-box HTTP test harness for DuaSaku E2E suite (zero internal server imports)

import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assert(cond, message = 'Assertion failed') {
  if (!cond) throw new AssertionError(message);
}

export function assertEqual(actual, expected, label = 'Values not equal') {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertApprox(actual, expected, tolerance = 1, label = 'Value out of tolerance') {
  if (typeof actual !== 'number' || !Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new AssertionError(
      `${label}: expected ${expected} ± ${tolerance}, got ${JSON.stringify(actual)}`
    );
  }
}

export function assertStatus(res, expectedStatus, label = 'HTTP status mismatch') {
  const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!allowed.includes(res.status)) {
    throw new AssertionError(
      `${label}: expected status ${allowed.join('|')}, got ${res.status} (body: ${JSON.stringify(res.data)})`
    );
  }
}

export function assertMatch(str, regex, label = 'Regex mismatch') {
  if (typeof str !== 'string' || !regex.test(str)) {
    throw new AssertionError(`${label}: ${JSON.stringify(str)} did not match ${regex}`);
  }
}

export function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

async function waitForHealth(baseUrl, child, getLogs, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      const logs = getLogs();
      throw new Error(`API server exited prematurely (code=${child.exitCode}): ${logs.stderr || logs.stdout}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok === true) {
          return data;
        }
      }
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  const logs = getLogs();
  throw new Error(`Timed out waiting for ${baseUrl}/api/health (${logs.stderr || logs.stdout})`);
}

export async function startApiServer({
  cwd = PROJECT_ROOT,
  databaseUrl = '',
  envOverrides = {},
  timeoutMs = 10000,
  maxRetries = 3,
} = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let stdout = '';
    let stderr = '';

    const child = spawn(process.execPath, ['server/index.mjs'], {
      cwd,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        PORT: String(port),
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const stop = async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
          }
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    };

    try {
      const health = await waitForHealth(baseUrl, child, () => ({ stdout, stderr }), timeoutMs);
      return {
        url: baseUrl,
        port,
        storage: health.storage,
        child,
        getLogs: () => ({ stdout, stderr }),
        stop,
      };
    } catch (err) {
      lastErr = err;
      await stop();
      const logs = `${stdout}\n${stderr}\n${err.message}`;
      if (!logs.includes('EADDRINUSE') || attempt === maxRetries) {
        break;
      }
    }
  }
  throw lastErr || new Error('Failed to start ephemeral API server');
}

export async function apiRequest(baseUrl, pathStr, { method = 'GET', token, body, headers = {} } = {}) {
  const reqHeaders = { ...headers };
  if (body !== undefined && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }
  if (token !== undefined) {
    reqHeaders.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}${pathStr}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  const rawText = await res.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = rawText;
  }

  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    data,
    rawText,
  };
}

export async function createCouple(baseUrl, { coupleName = 'Dompet Masa Depan', partnerName = 'Raka' } = {}) {
  const res = await apiRequest(baseUrl, '/api/couples/create', {
    method: 'POST',
    body: { coupleName, partnerName },
  });
  assertStatus(res, 201, 'createCouple');
  assert(res.data?.token, 'createCouple missing token');
  assert(res.data?.couple?.id, 'createCouple missing couple.id');
  assert(res.data?.partner?.id, 'createCouple missing partner.id');
  return res.data;
}

export async function joinCouple(baseUrl, inviteCode, { partnerName = 'Nadia' } = {}) {
  const res = await apiRequest(baseUrl, '/api/couples/join', {
    method: 'POST',
    body: { inviteCode, partnerName },
  });
  assertStatus(res, 201, 'joinCouple');
  assert(res.data?.token, 'joinCouple missing token');
  return res.data;
}

export async function setupCoupleContext(baseUrl, { withPartnerB = true, coupleName = 'Dompet E2E', nameA = 'Raka', nameB = 'Nadia' } = {}) {
  const created = await createCouple(baseUrl, { coupleName, partnerName: nameA });
  let joined = null;
  if (withPartnerB) {
    joined = await joinCouple(baseUrl, created.couple.inviteCode, { partnerName: nameB });
  }
  const catRes = await apiRequest(baseUrl, '/api/categories', { token: created.token });
  assertStatus(catRes, 200, 'setupCoupleContext getCategories');
  assert(Array.isArray(catRes.data) && catRes.data.length >= 4, 'Expected at least 4 default categories');
  return {
    couple: created.couple,
    tokenA: created.token,
    partnerA: created.partner,
    tokenB: joined ? joined.token : null,
    partnerB: joined ? joined.partner : null,
    categories: catRes.data,
  };
}

export async function createAccount(baseUrl, token, payload) {
  const res = await apiRequest(baseUrl, '/api/accounts', {
    method: 'POST',
    token,
    body: payload,
  });
  assertStatus(res, 201, 'createAccount');
  assert(res.data?.account?.id, 'createAccount missing data.account');
  return res.data.account;
}

export async function createTx(baseUrl, token, payload) {
  const res = await apiRequest(baseUrl, '/api/transactions', {
    method: 'POST',
    token,
    body: payload,
  });
  assertStatus(res, 201, 'createTx');
  assert(res.data?.transaction?.id, 'createTx missing data.transaction');
  return res.data.transaction;
}

export async function saveBudget(baseUrl, token, payload, method = 'POST') {
  const res = await apiRequest(baseUrl, '/api/budgets', {
    method,
    token,
    body: payload,
  });
  assertStatus(res, [200, 201], 'saveBudget');
  assert(res.data?.budget?.id, 'saveBudget missing data.budget');
  return res.data.budget;
}
