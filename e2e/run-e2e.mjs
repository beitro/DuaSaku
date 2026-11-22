#!/usr/bin/env node
// Opaque-box 4-tier E2E test runner for DuaSaku (zero extra dependencies)

import process from 'node:process';
import {
  PROJECT_ROOT,
  startApiServer,
} from './lib/harness.mjs';
import {
  exportExpoWeb,
  findChromeBinary,
  launchBrowser,
  startStaticServer,
} from './lib/cdp.mjs';
import { getTier1Tests } from './tiers/tier1-features.mjs';
import { getTier2Tests } from './tiers/tier2-boundaries.mjs';
import { getTier3Tests } from './tiers/tier3-pairwise.mjs';
import { getTier4Tests } from './tiers/tier4-scenarios.mjs';

const ALL_FEATURES = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

function parseArgs(argv) {
  const opts = {
    tier: 'all',
    list: false,
    dryRun: false,
    apiUrl: process.env.E2E_API_URL || '',
    skipBrowser: process.env.E2E_SKIP_BROWSER === '1',
    json: false,
  };
  for (const arg of argv) {
    if (arg === '--list') opts.list = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--skip-browser') opts.skipBrowser = true;
    else if (arg === '--json') opts.json = true;
    else if (arg.startsWith('--tier=')) opts.tier = arg.slice('--tier='.length).trim().toLowerCase();
    else if (arg.startsWith('--api-url=')) opts.apiUrl = arg.slice('--api-url='.length).trim();
    else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node e2e/run-e2e.mjs [--tier=1|2|3|4|all] [--list] [--dry-run] [--api-url=<url>] [--skip-browser] [--json]'
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }
  if (!['1', '2', '3', '4', 'all'].includes(opts.tier)) {
    throw new Error(`Invalid --tier=${opts.tier}; expected 1|2|3|4|all`);
  }
  return opts;
}

function getAllCatalogTests() {
  return [
    ...getTier1Tests(),
    ...getTier2Tests(),
    ...getTier3Tests(),
    ...getTier4Tests(),
  ];
}

function validateCatalog(tests) {
  const errors = [];
  const seenIds = new Set();
  const byTier = { 1: [], 2: [], 3: [], 4: [] };

  for (const t of tests) {
    if (!t.id || typeof t.id !== 'string') errors.push('Test missing string id');
    else if (seenIds.has(t.id)) errors.push(`Duplicate test id: ${t.id}`);
    seenIds.add(t.id);

    if (![1, 2, 3, 4].includes(t.tier)) errors.push(`Invalid tier on ${t.id}: ${t.tier}`);
    else byTier[t.tier].push(t);

    if (!ALL_FEATURES.includes(t.feature)) errors.push(`Invalid feature on ${t.id}: ${t.feature}`);
    if (!['api', 'static', 'browser'].includes(t.kind)) errors.push(`Invalid kind on ${t.id}: ${t.kind}`);
    if (typeof t.description !== 'string' || t.description.trim().length < 5) {
      errors.push(`Empty or too-short description on ${t.id}`);
    }
    if (typeof t.fn !== 'function') errors.push(`Missing function fn on ${t.id}`);
  }

  for (const tierNum of [1, 2]) {
    for (const f of ALL_FEATURES) {
      const count = byTier[tierNum].filter((t) => t.feature === f).length;
      if (count < 5) {
        errors.push(`Tier ${tierNum} feature ${f} has ${count} tests (< 5 required)`);
      }
    }
  }

  const t3Covered = new Set();
  for (const t of byTier[3]) {
    for (const f of t.features || [t.feature]) t3Covered.add(f);
  }
  for (const f of ALL_FEATURES) {
    if (!t3Covered.has(f)) errors.push(`Tier 3 pairwise coverage missing feature ${f}`);
  }

  if (byTier[4].length < 5) {
    errors.push(`Tier 4 has ${byTier[4].length} scenarios (< 5 required)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    counts: {
      tier1: byTier[1].length,
      tier2: byTier[2].length,
      tier3: byTier[3].length,
      tier4: byTier[4].length,
      total: tests.length,
    },
  };
}

function selectTests(allTests, tierOpt) {
  if (tierOpt === 'all') return allTests;
  const n = Number(tierOpt);
  return allTests.filter((t) => t.tier === n);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const allTests = getAllCatalogTests();
  const validation = validateCatalog(allTests);
  const selected = selectTests(allTests, opts.tier);

  if (opts.list) {
    if (opts.json) {
      console.log(
        JSON.stringify(
          selected.map(({ id, tier, feature, features, kind, description }) => ({
            id,
            tier,
            feature,
            features: features || [feature],
            kind,
            description,
          })),
          null,
          2
        )
      );
    } else {
      for (const t of selected) {
        console.log(`[T${t.tier}][${t.feature}][${t.kind}] ${t.id} — ${t.description}`);
      }
      console.log(`Total listed: ${selected.length} (catalog total: ${allTests.length})`);
    }
    return;
  }

  if (opts.dryRun) {
    const featureMatrix = {};
    for (const f of ALL_FEATURES) {
      featureMatrix[f] = {
        tier1: allTests.filter((t) => t.tier === 1 && t.feature === f).length,
        tier2: allTests.filter((t) => t.tier === 2 && t.feature === f).length,
        tier3: allTests.filter((t) => t.tier === 3 && (t.features || [t.feature]).includes(f)).length,
        tier4: allTests.filter((t) => t.tier === 4 && (t.features || [t.feature]).includes(f)).length,
      };
    }

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            mode: 'DRY-RUN',
            runtimeExecuted: false,
            validation,
            featureMatrix,
            selectedCount: selected.length,
          },
          null,
          2
        )
      );
    } else {
      console.log('[DRY-RUN] Catalog validation ONLY — no runtime tests were executed or claimed passed.');
      console.log(`Catalog counts: T1=${validation.counts.tier1}, T2=${validation.counts.tier2}, T3=${validation.counts.tier3}, T4=${validation.counts.tier4}, Total=${validation.counts.total}`);
      console.table(featureMatrix);
      if (!validation.valid) {
        console.error('[DRY-RUN] Validation FAILED:', validation.errors);
      } else {
        console.log(`[DRY-RUN] Catalog structure valid. Selected for --tier=${opts.tier}: ${selected.length} tests.`);
      }
    }
    process.exitCode = validation.valid ? 0 : 1;
    return;
  }

  if (!validation.valid) {
    console.error('Catalog validation failed:', validation.errors);
    process.exitCode = 1;
    return;
  }

  const cleanups = [];
  let cleaningUp = false;
  const runCleanup = async () => {
    if (cleaningUp) return;
    cleaningUp = true;
    for (const fn of cleanups.reverse()) {
      await fn().catch(() => undefined);
    }
  };

  const onSignal = (sig) => {
    console.error(`\nReceived ${sig}, cleaning up E2E resources...`);
    runCleanup().finally(() => process.exit(130));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const results = [];
  const startAll = Date.now();

  try {
    let apiUrl = opts.apiUrl;
    if (!apiUrl) {
      const apiSrv = await startApiServer({ cwd: PROJECT_ROOT, databaseUrl: '' });
      cleanups.push(apiSrv.stop);
      apiUrl = apiSrv.url;
      if (!opts.json) {
        console.log(`Spawned ephemeral API server at ${apiUrl} (storage=${apiSrv.storage})`);
      }
    } else {
      if (!opts.json) {
        console.log(`Targeting external API server at ${apiUrl}`);
      }
      const healthUrl = `${apiUrl.replace(/\/$/, '')}/api/health`;
      let healthRes;
      try {
        healthRes = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
      } catch (err) {
        throw new Error(`External API server unreachable at ${healthUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (!healthRes.ok) {
        throw new Error(`External API server health check failed at ${healthUrl}: HTTP ${healthRes.status}`);
      }
    }

    const needsBrowser = selected.some((t) => t.kind === 'browser');
    const needsBundle = selected.some((t) => t.requiresBundle || (t.kind === 'browser' && !opts.skipBrowser));

    let webBundle = null;
    let bundleError = null;
    if (needsBundle) {
      try {
        webBundle = await exportExpoWeb({ projectDir: PROJECT_ROOT, apiUrl });
        cleanups.push(webBundle.cleanup);
        if (!opts.json) {
          console.log(`Exported Expo Web bundle to ${webBundle.outDir}`);
        }
      } catch (err) {
        bundleError = err;
      }
    }

    let staticSrv = null;
    let browser = null;
    let browserError = null;
    if (needsBrowser && !opts.skipBrowser) {
      if (bundleError) {
        browserError = bundleError;
      } else {
        try {
          const chromeBin = await findChromeBinary();
          if (!chromeBin) {
            throw new Error(
              'Headless Chromium binary not found (set E2E_CHROME_BIN or pass --skip-browser to explicitly skip browser tests).'
            );
          }
          staticSrv = await startStaticServer(webBundle.outDir);
          cleanups.push(staticSrv.stop);
          browser = await launchBrowser({ binaryPath: chromeBin });
          cleanups.push(browser.close);
          if (!opts.json) {
            console.log(`Serving Expo Web at ${staticSrv.url} with browser ${browser.binaryPath}`);
          }
        } catch (err) {
          browserError = err;
        }
      }
    }

    const ctx = {
      apiUrl,
      webUrl: staticSrv?.url || null,
      webBundle,
      cdp: browser?.cdp || null,
    };

    for (const test of selected) {
      const t0 = Date.now();
      if (test.kind === 'browser' && opts.skipBrowser) {
        results.push({
          id: test.id,
          tier: test.tier,
          feature: test.feature,
          kind: test.kind,
          status: 'SKIPPED',
          durationMs: 0,
          error: '--skip-browser specified',
        });
        if (!opts.json) console.log(`SKIP  ${test.id} (${test.description}) [--skip-browser]`);
        continue;
      }

      if (test.requiresBundle && bundleError) {
        results.push({
          id: test.id,
          tier: test.tier,
          feature: test.feature,
          kind: test.kind,
          status: 'FAIL',
          durationMs: Date.now() - t0,
          error: bundleError.message,
        });
        if (!opts.json) console.log(`FAIL  ${test.id} — ${bundleError.message}`);
        continue;
      }

      if (test.kind === 'browser' && browserError) {
        results.push({
          id: test.id,
          tier: test.tier,
          feature: test.feature,
          kind: test.kind,
          status: 'FAIL',
          durationMs: Date.now() - t0,
          error: browserError.message,
        });
        if (!opts.json) console.log(`FAIL  ${test.id} — ${browserError.message}`);
        continue;
      }

      try {
        await test.fn(ctx);
        const ms = Date.now() - t0;
        results.push({
          id: test.id,
          tier: test.tier,
          feature: test.feature,
          kind: test.kind,
          status: 'PASS',
          durationMs: ms,
        });
        if (!opts.json) console.log(`PASS  ${test.id} (${ms}ms)`);
      } catch (err) {
        const ms = Date.now() - t0;
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          id: test.id,
          tier: test.tier,
          feature: test.feature,
          kind: test.kind,
          status: 'FAIL',
          durationMs: ms,
          error: msg,
        });
        if (!opts.json) console.log(`FAIL  ${test.id} (${ms}ms) — ${msg}`);
      }
    }

    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    const skipped = results.filter((r) => r.status === 'SKIPPED').length;
    const totalMs = Date.now() - startAll;

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            summary: { total: results.length, passed, failed, skipped, durationMs: totalMs },
            results,
          },
          null,
          2
        )
      );
    } else {
      console.log(`\n=== E2E Summary (--tier=${opts.tier}) ===`);
      console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped} | Time: ${totalMs}ms`);
    }

    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await runCleanup();
  }
}

main().catch((err) => {
  console.error('Fatal E2E runner error:', err);
  process.exit(1);
});
