import assert from 'node:assert/strict';

// Test standalone persistent queue algorithm & live Shared Backend synchronization
const BASE_RETRY_DELAY_MS = 3000;
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;

function calculateBackoff(attempts, baseMs = BASE_RETRY_DELAY_MS) {
  const exp = Math.min(6, Math.max(0, attempts));
  const delay = baseMs * Math.pow(2.5, exp);
  const jitter = 100;
  return Math.min(MAX_RETRY_DELAY_MS, Math.round(delay + jitter));
}

class MemoryStore {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.get(k) ?? null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
}

const storage = new MemoryStore();
const QUEUE_KEY = 'duasaku_registration_sync_queue_v1';

function getQueue() {
  const raw = storage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveQueue(q) {
  storage.setItem(QUEUE_KEY, JSON.stringify(q));
}

function enqueue(item) {
  const cleanEmail = item.email.trim().toLowerCase();
  const queue = getQueue();
  const idx = queue.findIndex(q => q.email === cleanEmail);
  const entry = {
    id: `sync_${cleanEmail}_${Date.now()}`,
    email: cleanEmail,
    name: item.name.trim(),
    password: item.password,
    otpCode: item.otpCode?.trim(),
    appSlug: 'duasaku',
    createdAt: Date.now(),
    attempts: 0,
    nextRetryAt: Date.now(),
  };
  if (idx >= 0) {
    queue[idx] = { ...queue[idx], ...entry, attempts: queue[idx].attempts };
  } else {
    queue.push(entry);
  }
  saveQueue(queue);
  return entry;
}

async function drainQueue(apiSyncFn) {
  const now = Date.now();
  const queue = getQueue();
  const remaining = [];
  let drained = 0;
  let failed = 0;

  for (const item of queue) {
    if (item.nextRetryAt > now) {
      remaining.push(item);
      continue;
    }
    try {
      const ok = await apiSyncFn(item);
      if (ok) {
        drained++;
      } else {
        throw new Error("Sync returned false");
      }
    } catch (err) {
      failed++;
      const nextAttempts = item.attempts + 1;
      if (nextAttempts <= MAX_ATTEMPTS) {
        remaining.push({
          ...item,
          attempts: nextAttempts,
          nextRetryAt: Date.now() + calculateBackoff(nextAttempts),
          lastError: err.message
        });
      }
    }
  }
  saveQueue(remaining);
  return { drained, failed, remaining: remaining.length };
}

async function runTest() {
  console.log("=== RUNNING REGISTRATION PERSISTENT SYNC QUEUE VERIFICATION ===");

  // 1. Exponential Backoff Test
  console.log("1. Verifying Exponential Backoff...");
  const b0 = calculateBackoff(0);
  const b1 = calculateBackoff(1);
  const b2 = calculateBackoff(2);
  const b3 = calculateBackoff(3);
  const b8 = calculateBackoff(8);

  console.log(`- Attempt 0: ${b0}ms`);
  console.log(`- Attempt 1: ${b1}ms`);
  console.log(`- Attempt 2: ${b2}ms`);
  console.log(`- Attempt 3: ${b3}ms`);
  console.log(`- Attempt 8 (Capped): ${b8}ms`);

  assert(b1 > b0, "Attempt 1 backoff must be > Attempt 0");
  assert(b2 > b1, "Attempt 2 backoff must be > Attempt 1");
  assert(b3 > b2, "Attempt 3 backoff must be > Attempt 2");
  assert(b8 <= MAX_RETRY_DELAY_MS, "Must cap at MAX_RETRY_DELAY_MS");
  console.log("✓ Backoff formula strictly exponential and bounded.");

  // 2. Queue Operations & Persistence
  console.log("\n2. Verifying Queue Enqueue, Persistence & Deduplication...");
  const email1 = `test.queue.${Date.now()}@duasaku.test`;
  enqueue({ email: email1, name: "User One", password: "pwd", otpCode: "123456" });
  assert.equal(getQueue().length, 1);
  assert.equal(getQueue()[0].email, email1);

  // Enqueue same email with updated name
  enqueue({ email: email1, name: "User One Updated", password: "pwd" });
  assert.equal(getQueue().length, 1, "Must deduplicate email");
  assert.equal(getQueue()[0].name, "User One Updated");
  console.log("✓ Enqueue and deduplication verified.");

  // 3. Offline / Failure Retry Behavior
  console.log("\n3. Verifying Offline / Failure Behavior...");
  let offlineResult = await drainQueue(async () => {
    throw new Error("Network request failed (offline)");
  });
  assert.equal(offlineResult.drained, 0);
  assert.equal(offlineResult.failed, 1);
  assert.equal(offlineResult.remaining, 1);
  assert.equal(getQueue()[0].attempts, 1);
  assert(getQueue()[0].nextRetryAt > Date.now(), "nextRetryAt must be pushed to future");
  console.log("✓ Failed item persisted with incremented attempts & future retry timestamp.");

  // 4. Online Success & Live Endpoint Sync
  console.log("\n4. Verifying Online Drain against Live Shared Backend...");
  // Reset retry time to now
  const q = getQueue();
  q[0].nextRetryAt = Date.now() - 1000;
  saveQueue(q);

  let onlineResult = await drainQueue(async (item) => {
    const res = await fetch("https://shared-backend-two.vercel.app/api/users/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: item.email, name: item.name, appSlug: item.appSlug })
    });
    return res.ok;
  });

  assert.equal(onlineResult.drained, 1);
  assert.equal(onlineResult.remaining, 0);
  assert.equal(getQueue().length, 0, "Queue must be empty after successful drain");
  console.log("✓ Queue item drained and confirmed synced with Shared Backend.");

  console.log("\nALL TESTS PASSED (100% OK)");
}

runTest().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
