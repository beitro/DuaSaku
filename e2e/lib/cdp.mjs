// Zero-dependency Expo Web exporter, static HTTP server & Headless Chromium CDP driver (Node 24 native WebSocket)

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { PROJECT_ROOT } from './harness.mjs';

const execFileAsync = promisify(execFile);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

export async function exportExpoWeb({
  projectDir = PROJECT_ROOT,
  apiUrl,
  outDir,
} = {}) {
  const targetDir = outDir || (await fs.mkdtemp(path.join(os.tmpdir(), 'duasaku-e2e-web-')));
  try {
    const env = {
      ...process.env,
      ...(apiUrl ? { EXPO_PUBLIC_API_URL: apiUrl } : {}),
    };

    await new Promise((resolve, reject) => {
      const child = spawn('npx', ['expo', 'export', '--platform', 'web', '--output-dir', targetDir], {
        cwd: projectDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => (stdout += d.toString()));
      child.stderr?.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`expo export exited with ${code}:\n${stdout}\n${stderr}`));
      });
    });

    const htmlPath = path.join(targetDir, 'index.html');
    const html = await fs.readFile(htmlPath, 'utf8');

    const jsDir = path.join(targetDir, '_expo/static/js/web');
    const files = await fs.readdir(jsDir);
    const bundleFiles = files.filter((f) => /^index-.*\.js$/.test(f) || f.endsWith('.js'));
    if (bundleFiles.length === 0) {
      throw new Error(`No web JS bundle found under ${jsDir}`);
    }
    const bundlePath = path.join(jsDir, bundleFiles[0]);
    const bundleCode = await fs.readFile(bundlePath, 'utf8');

    return {
      outDir: targetDir,
      htmlPath,
      html,
      bundlePath,
      bundleCode,
      cleanup: async () => {
        await fs.rm(targetDir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

export async function startStaticServer(rootDir) {
  const absRoot = path.resolve(rootDir);
  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      let relPath = decodeURIComponent(reqUrl.pathname);
      if (relPath === '/') relPath = '/index.html';

      let filePath = path.resolve(absRoot, '.' + relPath);
      if (!filePath.startsWith(absRoot)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      let stat;
      try {
        stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          filePath = path.join(filePath, 'index.html');
          stat = await fs.stat(filePath);
        }
      } catch {
        // SPA fallback
        filePath = path.join(absRoot, 'index.html');
        stat = await fs.stat(filePath);
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });
      fsSync.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500);
      res.end(err instanceof Error ? err.message : 'Server error');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    server,
    stop: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function canRunChromeBinary(binPath) {
  try {
    await execFileAsync(binPath, ['--no-sandbox', '--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function findChromeBinary() {
  const explicit = (process.env.E2E_CHROME_BIN || '').trim();
  if (explicit) {
    try {
      await fs.access(explicit, fsSync.constants.X_OK);
      if (await canRunChromeBinary(explicit)) {
        return explicit;
      }
    } catch {
      // Explicit binary invalid or not executable
    }
    return null;
  }

  const candidates = [];
  const msPlaywrightDir = path.join(os.homedir(), '.cache', 'ms-playwright');
  try {
    const entries = await fs.readdir(msPlaywrightDir);
    const headlessDirs = entries
      .filter((e) => e.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse();
    for (const dir of headlessDirs) {
      candidates.push(
        path.join(msPlaywrightDir, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
      );
      candidates.push(path.join(msPlaywrightDir, dir, 'chrome-linux', 'headless_shell'));
    }
    const chromiumDirs = entries
      .filter((e) => e.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const dir of chromiumDirs) {
      candidates.push(path.join(msPlaywrightDir, dir, 'chrome-linux64', 'chrome'));
      candidates.push(path.join(msPlaywrightDir, dir, 'chrome-linux', 'chrome'));
    }
  } catch {
    // ignore missing cache dir
  }

  for (const name of ['chromium', 'chromium-browser', 'google-chrome']) {
    try {
      const { stdout } = await execFileAsync('which', [name], { timeout: 2000 });
      const resolved = stdout.trim();
      if (resolved) candidates.push(resolved);
    } catch {
      // not on PATH
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await fs.access(candidate, fsSync.constants.X_OK);
      if (await canRunChromeBinary(candidate)) {
        return candidate;
      }
    } catch {
      // keep probing
    }
  }
  return null;
}

export async function launchBrowser({ binaryPath } = {}) {
  const bin = binaryPath || (await findChromeBinary());
  if (!bin) {
    throw new Error(
      'No runnable Chromium / chrome-headless-shell binary found. Set E2E_CHROME_BIN or pass --skip-browser.'
    );
  }

  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'duasaku-e2e-chrome-'));
  let child = null;
  let cdp = null;

  const close = async () => {
    await cdp?.close().catch(() => undefined);
    if (child && child.exitCode === null && child.signalCode === null) {
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
    }
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
  };

  try {
    const args = [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ];

    // chrome-headless-shell doesn't need/may ignore --headless=new; check binary name
    const finalArgs = path.basename(bin).includes('headless')
      ? args.filter((a) => a !== '--headless=new')
      : args;

    child = spawn(bin, finalArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    const wsBrowserUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for DevTools URL from ${bin}. stderr:\n${stderr}`));
      }, 12000);

      const onData = (chunk) => {
        stderr += chunk.toString();
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      };
      child.stderr?.on('data', onData);
      child.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Browser exited early (code=${code}): ${stderr}`));
      });
    });

    const parsed = new URL(wsBrowserUrl);
    const httpBase = `http://${parsed.hostname}:${parsed.port}`;

    let pageTarget = null;
    for (let i = 0; i < 30; i++) {
      const res = await fetch(`${httpBase}/json/list`);
      const list = await res.json();
      pageTarget = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pageTarget) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!pageTarget) {
      const created = await fetch(`${httpBase}/json/new?about:blank`).then((r) => r.json());
      pageTarget = created;
    }

    cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    return {
      binaryPath: bin,
      cdp,
      close,
    };
  } catch (err) {
    await close();
    throw err;
  }
}

export class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.exceptions = [];
    this.consoleErrors = [];
    this.serverErrors = [];
    this.requests = [];
    this.fetchInterceptors = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (err) => reject(new Error(`WebSocket error: ${err?.message || 'unknown'}`)));
      ws.addEventListener('close', () => {
        for (const { reject: rej } of this.pending.values()) {
          rej(new Error('CDP WebSocket closed'));
        }
        this.pending.clear();
      });
      ws.addEventListener('message', (ev) => {
        let msg;
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
        } catch {
          return;
        }
        if (msg.id !== undefined) {
          const entry = this.pending.get(msg.id);
          if (entry) {
            this.pending.delete(msg.id);
            if (msg.error) {
              entry.reject(new Error(`CDP ${entry.method}: ${msg.error.message}`));
            } else {
              entry.resolve(msg.result);
            }
          }
          return;
        }
        if (msg.method) {
          this._handleEvent(msg.method, msg.params || {});
        }
      });
    });
  }

  _handleEvent(method, params) {
    if (method === 'Runtime.exceptionThrown') {
      const desc =
        params.exceptionDetails?.exception?.description ||
        params.exceptionDetails?.text ||
        'Uncaught exception';
      this.exceptions.push(desc);
    } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      const text = (params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      this.consoleErrors.push(text);
    } else if (method === 'Network.responseReceived') {
      if (params.response?.status >= 500) {
        this.serverErrors.push({
          url: params.response.url,
          status: params.response.status,
        });
      }
    } else if (method === 'Network.requestWillBeSent') {
      this.requests.push({
        method: params.request?.method,
        url: params.request?.url,
        postData: params.request?.postData || null,
      });
    } else if (method === 'Fetch.requestPaused') {
      this._onRequestPaused(params).catch(() => undefined);
    }

    const handlers = this.listeners.get(method);
    if (handlers) {
      for (const h of handlers) h(params);
    }
  }

  async _onRequestPaused(params) {
    for (const handler of this.fetchInterceptors) {
      const handled = await handler(params, this);
      if (handled) return;
    }
    await this.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => undefined);
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(fn);
    return () => this.listeners.get(method)?.delete(fn);
  }

  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP not connected (calling ${method})`));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout on ${method}`));
      }, 15000);
      this.pending.set(id, {
        method,
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  clearTrackedErrors() {
    this.exceptions = [];
    this.consoleErrors = [];
    this.serverErrors = [];
  }

  clearTrackedRequests() {
    this.requests = [];
  }

  getErrors() {
    return {
      exceptions: [...this.exceptions],
      consoleErrors: [...this.consoleErrors],
      serverErrors: [...this.serverErrors],
    };
  }

  async failNextRequestMatching(urlSubstr, status = 500, bodyObj = { error: 'Simulasi galat server' }) {
    await this.send('Fetch.enable', { patterns: [{ urlPattern: `*${urlSubstr}*` }] });
    let consumed = false;
    const interceptor = async (params) => {
      if (!consumed && params.request?.url?.includes(urlSubstr)) {
        consumed = true;
        const body = Buffer.from(JSON.stringify(bodyObj)).toString('base64');
        await this.send('Fetch.fulfillRequest', {
          requestId: params.requestId,
          responseCode: status,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Access-Control-Allow-Origin', value: '*' },
          ],
          body,
        });
        await this.send('Fetch.disable').catch(() => undefined);
        const idx = this.fetchInterceptors.indexOf(interceptor);
        if (idx >= 0) this.fetchInterceptors.splice(idx, 1);
        return true;
      }
      return false;
    };
    this.fetchInterceptors.push(interceptor);
  }

  async setViewport(width, height, mobile = width < 600) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
  }

  async navigate(url, { waitMs = 10000 } = {}) {
    await this.send('Page.navigate', { url });
    await this.waitForDomReady(waitMs);
  }

  async reload({ waitMs = 10000 } = {}) {
    await this.send('Page.reload', { ignoreCache: true });
    await this.waitForDomReady(waitMs);
  }

  async waitForDomReady(timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ready = await this.evalFn(() => {
        const txt = document.body?.innerText?.trim() || '';
        return document.readyState === 'complete' && txt.length > 0;
      }).catch(() => false);
      if (ready) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('Timed out waiting for page DOM content to render');
  }

  async evalFn(fn, ...args) {
    const serializedArgs = args.map((a) => JSON.stringify(a)).join(', ');
    const expression = `(${fn.toString()})(${serializedArgs})`;
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `Browser eval exception: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`
      );
    }
    return res.result?.value;
  }

  async getBodyText() {
    return (await this.evalFn(() => document.body?.innerText || '')) || '';
  }

  async waitForText(textOrPattern, { timeoutMs = 8000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    const isRegex = textOrPattern instanceof RegExp;
    const patSource = isRegex ? textOrPattern.source : null;
    const patFlags = isRegex ? textOrPattern.flags : null;

    while (Date.now() < deadline) {
      const body = await this.getBodyText();
      const matched = isRegex
        ? new RegExp(patSource, patFlags).test(body)
        : body.includes(String(textOrPattern));
      if (matched) return body;
      await new Promise((r) => setTimeout(r, 100));
    }
    const finalText = await this.getBodyText();
    throw new Error(
      `Timed out waiting for text ${String(textOrPattern)}. Current body snippet:\n${finalText.slice(0, 500)}`
    );
  }

  async waitForGoneText(text, { timeoutMs = 8000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const body = await this.getBodyText();
      if (!body.includes(text)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timed out waiting for text "${text}" to disappear`);
  }

  async findElementRectByText(textOrRegex, { exact = false, index = 0, last = false, clickableOnly = false } = {}) {
    const isRegex = textOrRegex instanceof RegExp;
    const targetStr = isRegex ? textOrRegex.source : String(textOrRegex);
    const flags = isRegex ? textOrRegex.flags : '';

    return await this.evalFn(
      (str, regexFlags, useRegex, exactMatch, idx, pickLast, requireClickable) => {
        const re = useRegex ? new RegExp(str, regexFlags) : null;
        const normalize = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const isVisible = (el) => {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
          }
          const r = el.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        };
        const isClickable = (el) => {
          let cur = el;
          while (cur && cur !== document.body) {
            const role = cur.getAttribute?.('role');
            const tabIdx = cur.getAttribute?.('tabindex');
            const tag = cur.tagName?.toLowerCase();
            const cs = getComputedStyle(cur);
            if (
              tag === 'button' ||
              tag === 'a' ||
              role === 'button' ||
              role === 'tab' ||
              tabIdx === '0' ||
              cs.cursor === 'pointer'
            ) {
              return cur;
            }
            cur = cur.parentElement;
          }
          return null;
        };

        const matchesText = (txt) => {
          const norm = normalize(txt);
          if (!norm) return false;
          if (re) return re.test(norm);
          return exactMatch ? norm === str : norm.includes(str);
        };

        const all = Array.from(document.querySelectorAll('*'));
        const candidates = [];
        for (const el of all) {
          if (!isVisible(el)) continue;
          const directOrLeafText = normalize(el.innerText);
          if (!matchesText(directOrLeafText)) continue;
          // Prefer innermost element whose own text matches, or clickable target
          const hasMatchingChild = Array.from(el.children).some(
            (c) => isVisible(c) && matchesText(c.innerText)
          );
          if (hasMatchingChild) continue;
          const clickable = isClickable(el);
          if (requireClickable && !clickable) continue;
          const targetEl = clickable || el;
          const rect = targetEl.getBoundingClientRect();
          candidates.push({
            el: targetEl,
            text: directOrLeafText,
            rect: {
              x: rect.x,
              y: rect.y,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            },
          });
        }

        // Deduplicate by target element
        const unique = [];
        const seen = new Set();
        for (const c of candidates) {
          if (!seen.has(c.el)) {
            seen.add(c.el);
            unique.push(c);
          }
        }
        if (unique.length === 0) return null;
        const chosen = pickLast ? unique[unique.length - 1] : unique[Math.min(idx, unique.length - 1)];
        chosen.el.scrollIntoView({ block: 'center', inline: 'center' });
        const fresh = chosen.el.getBoundingClientRect();
        return {
          text: chosen.text,
          count: unique.length,
          rect: {
            x: fresh.x,
            y: fresh.y,
            left: fresh.left,
            right: fresh.right,
            top: fresh.top,
            bottom: fresh.bottom,
            width: fresh.width,
            height: fresh.height,
          },
        };
      },
      targetStr,
      flags,
      isRegex,
      exact,
      index,
      last,
      clickableOnly
    );
  }

  async clickByText(textOrRegex, opts = {}) {
    const found = await this.findElementRectByText(textOrRegex, {
      ...opts,
      clickableOnly: opts.clickableOnly ?? false,
    });
    if (!found) {
      const body = await this.getBodyText();
      throw new Error(
        `Element with text ${String(textOrRegex)} not found. Visible DOM:\n${body.slice(0, 600)}`
      );
    }
    const cx = found.rect.left + found.rect.width / 2;
    const cy = found.rect.top + found.rect.height / 2;
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: cx,
      y: cy,
      button: 'left',
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: cx,
      y: cy,
      button: 'left',
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 80));
    return found;
  }

  async fillInput(hint, value) {
    const isRegex = hint instanceof RegExp;
    const hintStr = isRegex ? hint.source : String(hint);
    const hintFlags = isRegex ? hint.flags : 'i';

    const focused = await this.evalFn(
      (targetStr, flags, useRegex) => {
        const re = useRegex ? new RegExp(targetStr, flags) : null;
        const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const matchesHint = (txt) => {
          const n = norm(txt);
          if (!n) return false;
          return re ? re.test(n) : n.toLowerCase().includes(targetStr.toLowerCase());
        };
        const inputs = Array.from(document.querySelectorAll('input, textarea')).filter((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1 && !el.disabled;
        });

        const score = (el) => {
          const ph = el.getAttribute('placeholder') || '';
          const aria = el.getAttribute('aria-label') || '';
          if (matchesHint(ph) || matchesHint(aria)) return 3;
          let parent = el.parentElement;
          for (let depth = 0; depth < 3 && parent; depth++) {
            const prev = parent.previousElementSibling;
            if (prev && matchesHint(prev.innerText)) return 2;
            const prevSelf = el.previousElementSibling;
            if (prevSelf && matchesHint(prevSelf.innerText)) return 2;
            if (matchesHint(parent.innerText)) return 1;
            parent = parent.parentElement;
          }
          return 0;
        };

        const ranked = inputs
          .map((el) => ({ el, score: score(el) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score);

        if (ranked.length === 0) {
          return {
            ok: false,
            available: inputs.map((el) => ({
              placeholder: el.getAttribute('placeholder'),
              ariaLabel: el.getAttribute('aria-label'),
              value: el.value,
            })),
          };
        }
        const el = ranked[0].el;
        el.scrollIntoView({ block: 'center' });
        el.focus();
        if (typeof el.select === 'function') el.select();
        return { ok: true, prevValue: el.value || '' };
      },
      hintStr,
      hintFlags,
      isRegex
    );

    if (!focused?.ok) {
      throw new Error(
        `Input matching "${hint}" not found. Available inputs: ${JSON.stringify(focused?.available || [])}`
      );
    }

    // Clear via Backspace if there was existing text
    if (focused.prevValue.length > 0) {
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'a',
        code: 'KeyA',
        modifiers: 2, // Ctrl
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'a',
        code: 'KeyA',
        modifiers: 2,
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Backspace',
        code: 'Backspace',
        windowsVirtualKeyCode: 8,
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Backspace',
        code: 'Backspace',
        windowsVirtualKeyCode: 8,
      });
    }

    const strVal = String(value);
    if (strVal.length > 0) {
      await this.send('Input.insertText', { text: strVal });
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  async clearStorage() {
    await this.evalFn(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  }

  async setStorageItem(key, val) {
    await this.evalFn(
      (k, v) => {
        localStorage.setItem(k, v);
      },
      key,
      val
    );
  }

  async getAllStorage() {
    return await this.evalFn(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) out[k] = localStorage.getItem(k);
      }
      return out;
    });
  }

  async getDomAudit() {
    return await this.evalFn(() => {
      const parseRgba = (str) => {
        const m = String(str).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
        if (!m) return null;
        return {
          r: Number(m[1]),
          g: Number(m[2]),
          b: Number(m[3]),
          a: m[4] === undefined ? 1 : Number(m[4]),
        };
      };
      const composite = (fg, bg) => {
        const a = fg.a ?? 1;
        return {
          r: Math.round(fg.r * a + bg.r * (1 - a)),
          g: Math.round(fg.g * a + bg.g * (1 - a)),
          b: Math.round(fg.b * a + bg.b * (1 - a)),
          a: 1,
        };
      };
      const lum = (c) => {
        const lin = [c.r, c.g, c.b].map((v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
      };
      const ratio = (c1, c2) => {
        const l1 = lum(c1);
        const l2 = lum(c2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const effectiveBg = (el) => {
        const layers = [];
        let cur = el;
        while (cur && cur.nodeType === 1) {
          const bg = parseRgba(getComputedStyle(cur).backgroundColor);
          if (bg && bg.a > 0) layers.push(bg);
          if (bg && bg.a >= 0.99) break;
          cur = cur.parentElement;
        }
        let base = { r: 255, g: 255, b: 255, a: 1 };
        for (let i = layers.length - 1; i >= 0; i--) {
          base = layers[i].a >= 0.99 ? layers[i] : composite(layers[i], base);
        }
        return base;
      };

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const contrastFailures = [];
      const textSamples = [];
      let node;
      while ((node = walker.nextNode())) {
        const text = (node.nodeValue || '').trim();
        if (!text) continue;
        const el = node.parentElement;
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
        const fg = parseRgba(cs.color);
        if (!fg || fg.a === 0) continue;
        const bg = effectiveBg(el);
        const effectiveFg = fg.a < 1 ? composite(fg, bg) : fg;
        const cr = ratio(effectiveFg, bg);
        const fontSize = parseFloat(cs.fontSize) || 14;
        const fontWeight = parseInt(cs.fontWeight, 10) || 400;
        const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const minReq = isLarge ? 3.0 : 4.5;
        if (cr < minReq) {
          contrastFailures.push({
            text: text.slice(0, 60),
            cr: Number(cr.toFixed(2)),
            minReq,
            fg: cs.color,
            bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
            fontSize,
            fontWeight,
          });
        }
        textSamples.push({ text: text.slice(0, 40), fg: cs.color, bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`, cr: Number(cr.toFixed(2)) });
      }

      const bodyBg = effectiveBg(document.body?.firstElementChild || document.body);
      const scrollWidth = document.documentElement.scrollWidth;
      const innerWidth = window.innerWidth;
      const bodyText = document.body?.innerText || '';

      return {
        bodyBg: `rgb(${bodyBg.r}, ${bodyBg.g}, ${bodyBg.b})`,
        scrollWidth,
        innerWidth,
        contrastFailures,
        sampleCount: textSamples.length,
        hasNaN: /\bNaN\b/.test(bodyText),
        hasInfinity: /\bInfinity\b/.test(bodyText),
        hasUndefined: /\bundefined\b/.test(bodyText),
      };
    });
  }

  async close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}
