// SPDX-License-Identifier: MIT
/**
 * Frontend performance: Lighthouse when it is installed (locally in the
 * project, globally, or via PERF_PROFILER_LIGHTHOUSE), otherwise a headless
 * Chrome/Edge run that collects Core Web Vitals through PerformanceObserver
 * over the DevTools protocol. Neither is bundled; a clear error explains what
 * to install when both are missing.
 */

import { existsSync, realpathSync } from 'fs';
import { readFile, rm } from 'fs/promises';
import { dirname, extname, join } from 'path';
import { createRunDir } from '../utils/artifacts.js';
import { chromeOverride, lighthouseOverride } from '../utils/env.js';
import { createTempDir, findOnPath, findPackageUp, killTree, spawnProcess } from '../utils/process.js';
import { redactUrl } from '../utils/redact.js';
import { validateUrl } from '../utils/ssrf.js';
import { median, round } from '../utils/statistics.js';
import { recordRun } from '../results/store.js';
import { CdpClient } from '../live/cdp.js';

const IS_WIN = process.platform === 'win32';

export interface VitalsOptions {
  url: string;
  formFactor: 'mobile' | 'desktop';
  runs: number;
  engine: 'auto' | 'lighthouse' | 'chrome';
  signal?: AbortSignal;
}

export interface VitalsMetrics {
  performanceScore?: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  ttiMs: number | null;
  speedIndexMs?: number | null;
  ttfbMs?: number | null;
}

// ---------------------------------------------------------------------------
// Tool discovery
// ---------------------------------------------------------------------------

/** Resolve a runnable Lighthouse CLI as [cmd, ...prefixArgs] without going through a .cmd shim. */
export function resolveLighthouse(): { cmd: string; prefix: string[]; source: string } | null {
  const asNode = (js: string, source: string) => ({ cmd: process.execPath, prefix: [js], source });
  const override = lighthouseOverride();
  if (override) {
    if (!existsSync(override)) return null;
    return /\.(c|m)?js$/.test(override) ? asNode(override, 'PERF_PROFILER_LIGHTHOUSE') : { cmd: override, prefix: [], source: 'PERF_PROFILER_LIGHTHOUSE' };
  }
  const local = findPackageUp(process.cwd(), 'lighthouse');
  if (local && existsSync(join(local, 'cli', 'index.js'))) return asNode(join(local, 'cli', 'index.js'), `project (${local})`);
  const onPath = findOnPath('lighthouse');
  if (!onPath) return null;
  if (IS_WIN || /\.(cmd|bat|ps1)$/i.test(onPath)) {
    // npm's global layout on Windows: <prefix>\lighthouse.cmd + <prefix>\node_modules\lighthouse\cli\index.js
    const js = join(dirname(onPath), 'node_modules', 'lighthouse', 'cli', 'index.js');
    return existsSync(js) ? asNode(js, `global (${js})`) : null;
  }
  try {
    const real = realpathSync(onPath);
    return extname(real) === '.js' ? asNode(real, `global (${real})`) : { cmd: onPath, prefix: [], source: onPath };
  } catch {
    return { cmd: onPath, prefix: [], source: onPath };
  }
}

export function findChrome(): string | null {
  const override = chromeOverride();
  if (override) return existsSync(override) ? override : null;
  const candidates: string[] = [];
  if (IS_WIN) {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean) as string[];
    for (const r of roots) {
      candidates.push(join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      candidates.push(join(r, 'Chromium', 'Application', 'chrome.exe'));
      candidates.push(join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  }
  for (const c of candidates) if (existsSync(c)) return c;
  for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'chrome']) {
    const p = findOnPath(n);
    if (p) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lighthouse
// ---------------------------------------------------------------------------

interface LhAudit {
  id: string;
  title: string;
  score: number | null;
  numericValue?: number;
  displayValue?: string;
  details?: { type?: string; overallSavingsMs?: number; overallSavingsBytes?: number };
  metricSavings?: Record<string, number>;
}

export interface LighthouseSummary {
  metrics: VitalsMetrics;
  opportunities: Array<{ id: string; title: string; savingsMs?: number; savingsBytes?: number; displayValue?: string }>;
  lighthouseVersion?: string;
  finalUrl?: string;
  runWarnings?: string[];
}

/** Extract metrics and top opportunities from a Lighthouse result (LHR) JSON. */
export function parseLighthouseResult(lhr: {
  lighthouseVersion?: string;
  finalDisplayedUrl?: string;
  finalUrl?: string;
  runWarnings?: string[];
  runtimeError?: { code: string; message: string };
  categories?: { performance?: { score: number | null } };
  audits: Record<string, LhAudit>;
}): LighthouseSummary {
  if (lhr.runtimeError) throw new Error(`Lighthouse runtime error ${lhr.runtimeError.code}: ${lhr.runtimeError.message}`);
  const num = (id: string) => {
    const v = lhr.audits[id]?.numericValue;
    return typeof v === 'number' ? round(v, id === 'cumulative-layout-shift' ? 4 : 1) : null;
  };
  const score = lhr.categories?.performance?.score;
  const opportunities = Object.values(lhr.audits)
    .filter((a) => a.score !== null && a.score < 0.9)
    .map((a) => {
      const ms = a.details?.overallSavingsMs ?? Math.max(0, ...Object.entries(a.metricSavings ?? {}).filter(([k]) => k !== 'CLS').map(([, v]) => v));
      return {
        id: a.id,
        title: a.title,
        ...(ms > 0 ? { savingsMs: round(ms, 0) } : {}),
        ...(a.details?.overallSavingsBytes ? { savingsBytes: Math.round(a.details.overallSavingsBytes) } : {}),
        ...(a.displayValue ? { displayValue: a.displayValue } : {}),
        _rank: ms,
        _opp: a.details?.type === 'opportunity' || !!a.metricSavings,
      };
    })
    .filter((o) => o._opp && (o._rank > 0 || o.savingsBytes))
    .sort((x, y) => y._rank - x._rank || (y.savingsBytes ?? 0) - (x.savingsBytes ?? 0))
    .slice(0, 10)
    .map(({ _rank, _opp, ...o }) => o);
  return {
    metrics: {
      performanceScore: typeof score === 'number' ? Math.round(score * 100) : null,
      lcpMs: num('largest-contentful-paint'),
      cls: num('cumulative-layout-shift'),
      tbtMs: num('total-blocking-time'),
      fcpMs: num('first-contentful-paint'),
      ttiMs: num('interactive'),
      speedIndexMs: num('speed-index'),
      ttfbMs: num('server-response-time'),
    },
    opportunities,
    lighthouseVersion: lhr.lighthouseVersion,
    finalUrl: lhr.finalDisplayedUrl ?? lhr.finalUrl,
    runWarnings: lhr.runWarnings?.slice(0, 5),
  };
}

async function runLighthouse(
  lh: NonNullable<ReturnType<typeof resolveLighthouse>>,
  opts: VitalsOptions,
  outPath: string
): Promise<LighthouseSummary> {
  const chrome = findChrome();
  const args = [
    ...lh.prefix,
    opts.url,
    '--output=json',
    `--output-path=${outPath}`,
    '--only-categories=performance',
    '--quiet',
    '--chrome-flags=--headless=new --no-first-run --disable-extensions',
    ...(opts.formFactor === 'desktop' ? ['--preset=desktop'] : []),
  ];
  const res = await spawnProcess(lh.cmd, args, {
    timeout: 240_000,
    signal: opts.signal,
    env: chrome ? { CHROME_PATH: chrome } : undefined,
  });
  let text: string;
  try {
    text = await readFile(outPath, 'utf-8');
  } catch {
    throw new Error(`Lighthouse produced no report (exit ${res.exitCode}${res.timedOut ? ', timed out' : ''}): ${res.stderr.slice(-1500)}`);
  }
  return parseLighthouseResult(JSON.parse(text));
}

// ---------------------------------------------------------------------------
// Headless Chrome fallback
// ---------------------------------------------------------------------------

const OBSERVER_SCRIPT = `(() => {
  const v = window.__ppVitals = { lcp: null, cls: 0, fcp: null, longTasks: [] };
  const po = (type, cb) => { try { new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true }); } catch (e) {} };
  po('largest-contentful-paint', (e) => { v.lcp = e.renderTime || e.loadTime || e.startTime; });
  po('paint', (e) => { if (e.name === 'first-contentful-paint') v.fcp = e.startTime; });
  po('longtask', (e) => { v.longTasks.push([e.startTime, e.duration]); });
  let win = 0, winStart = 0, last = 0;
  po('layout-shift', (e) => {
    if (e.hadRecentInput) return;
    if (win && e.startTime - last < 1000 && e.startTime - winStart < 5000) win += e.value;
    else { win = e.value; winStart = e.startTime; }
    last = e.startTime;
    if (win > v.cls) v.cls = win;
  });
})();`;

async function waitForFile(path: string, timeoutMs: number): Promise<string> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const t = await readFile(path, 'utf-8');
      if (t.includes('\n')) return t;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Chrome did not open its DevTools port in time');
}

async function runChromeOnce(chrome: string, opts: VitalsOptions): Promise<VitalsMetrics & { domContentLoadedMs: number | null; loadMs: number | null }> {
  const profileDir = await createTempDir('pp-chrome');
  let pid: number | undefined;
  const proc = spawnProcess(
    chrome,
    ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', 'about:blank'],
    { timeout: 180_000, onSpawn: (p) => (pid = p), signal: opts.signal, maxOutputBytes: 64 * 1024 }
  );
  let client: CdpClient | undefined;
  try {
    const portFile = await waitForFile(join(profileDir, 'DevToolsActivePort'), 20_000);
    const [port, path] = portFile.trim().split(/\r?\n/);
    client = await CdpClient.connect(`ws://127.0.0.1:${port}${path}`);
    const { targetId } = await client.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
    const s = (m: string, p: Record<string, unknown> = {}, t = 30_000) => client!.send(m, p, t, sessionId);
    await s('Page.enable');
    await s('Network.enable');
    await s('Network.setCacheDisabled', { cacheDisabled: true });
    if (opts.formFactor === 'mobile') {
      // Lighthouse's default mobile profile: Moto G Power viewport, 4x CPU slowdown, slow 4G.
      await s('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
      await s('Emulation.setCPUThrottlingRate', { rate: 4 });
      await s('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    } else {
      await s('Emulation.setDeviceMetricsOverride', { width: 1350, height: 940, deviceScaleFactor: 1, mobile: false });
    }
    await s('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER_SCRIPT });
    const loaded = new Promise<void>((resolve) => client!.on('Page.loadEventFired', () => resolve(), sessionId));
    const nav = await s('Page.navigate', { url: opts.url }, 60_000);
    if ((nav as { errorText?: string }).errorText) throw new Error(`Navigation failed: ${(nav as { errorText: string }).errorText}`);
    await Promise.race([loaded, new Promise((_, rej) => setTimeout(() => rej(new Error('Page load timed out after 60s')), 60_000))]);
    await new Promise((r) => setTimeout(r, 3000)); // let late LCP / layout shifts / long tasks land
    const { result } = await s('Runtime.evaluate', {
      expression: `JSON.stringify({ v: window.__ppVitals, nav: (performance.getEntriesByType('navigation')[0] || {}).toJSON ? performance.getEntriesByType('navigation')[0].toJSON() : null })`,
      returnByValue: true,
    }) as { result: { value: string } };
    const data = JSON.parse(result.value) as {
      v: { lcp: number | null; cls: number; fcp: number | null; longTasks: Array<[number, number]> };
      nav: { responseStart?: number; domContentLoadedEventEnd?: number; loadEventEnd?: number } | null;
    };
    const fcp = data.v.fcp;
    const tbt = fcp === null ? null : data.v.longTasks.filter(([st]) => st >= fcp).reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0);
    return {
      lcpMs: data.v.lcp !== null ? round(data.v.lcp, 1) : null,
      cls: round(data.v.cls, 4),
      tbtMs: tbt !== null ? round(tbt, 1) : null,
      fcpMs: fcp !== null ? round(fcp, 1) : null,
      ttiMs: null,
      ttfbMs: data.nav?.responseStart ? round(data.nav.responseStart, 1) : null,
      domContentLoadedMs: data.nav?.domContentLoadedEventEnd ? round(data.nav.domContentLoadedEventEnd, 1) : null,
      loadMs: data.nav?.loadEventEnd ? round(data.nav.loadEventEnd, 1) : null,
    };
  } finally {
    client?.close();
    if (pid) await killTree(pid);
    await proc;
    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function medianMetrics<T extends object>(runs: T[]): T {
  const out: Record<string, number | null> = {};
  const keys = Object.keys(runs[0]) as Array<keyof T>;
  for (const k of keys) {
    const vals = runs.map((r) => r[k]).filter((v): v is T[keyof T] & number => typeof v === 'number' && Number.isFinite(v));
    out[k as string] = vals.length ? round(median(vals), 4) : null;
  }
  return out as T;
}

/** Validate the URL and locate the tools; throws with an actionable message. */
export async function preflightVitals(opts: Pick<VitalsOptions, 'url' | 'runs' | 'engine'>) {
  await validateUrl(opts.url);
  if (!Number.isInteger(opts.runs) || opts.runs < 1 || opts.runs > 5) throw new Error('runs must be an integer in [1, 5]');
  const lh = opts.engine === 'chrome' ? null : resolveLighthouse();
  const chrome = findChrome();
  if (opts.engine === 'lighthouse' && !lh) {
    throw new Error('Lighthouse not found. Install it (npm i -g lighthouse, or as a project devDependency) or set PERF_PROFILER_LIGHTHOUSE.');
  }
  if (!lh && !chrome) {
    throw new Error(
      'Neither Lighthouse nor Chrome/Chromium/Edge was found. Install Lighthouse (npm i -g lighthouse) and Chrome, ' +
        'or set PERF_PROFILER_CHROME to a Chromium-based browser executable.'
    );
  }
  return { lh, chrome };
}

export async function auditWebVitals(opts: VitalsOptions) {
  const { lh, chrome } = await preflightVitals(opts);
  const { runId, dir } = await createRunDir('web-vitals');
  const notes: string[] = [];
  let metrics: VitalsMetrics;
  let perRun: unknown[];
  let extra: Record<string, unknown> = {};
  const artifacts: Record<string, string> = {};
  if (lh) {
    const results: LighthouseSummary[] = [];
    for (let i = 0; i < opts.runs; i++) {
      const out = join(dir, `lighthouse-${i + 1}.json`);
      results.push(await runLighthouse(lh, opts, out));
      artifacts[`lighthouse${i + 1}`] = out;
    }
    metrics = medianMetrics(results.map((r) => r.metrics));
    perRun = results.map((r) => r.metrics);
    extra = {
      engine: 'lighthouse',
      lighthouse: { source: lh.source, version: results[0].lighthouseVersion },
      opportunities: results[results.length - 1].opportunities,
      ...(results[0].runWarnings?.length ? { runWarnings: results[0].runWarnings } : {}),
    };
    notes.push('Open the kept lighthouse-N.json at https://googlechrome.github.io/lighthouse/viewer/ for the full report.');
  } else {
    const runs = [];
    for (let i = 0; i < opts.runs; i++) runs.push(await runChromeOnce(chrome!, opts));
    metrics = medianMetrics(runs);
    perRun = runs;
    extra = { engine: 'chrome-cdp', browser: chrome };
    notes.push(
      'Lighthouse is not installed, so metrics come from PerformanceObserver in headless Chrome: LCP/CLS/FCP are the browser values, ' +
        'TBT is approximated from long tasks after FCP, TTI and opportunities need Lighthouse (npm i -g lighthouse).'
    );
  }
  if (opts.runs > 1) notes.push(`Values are medians of ${opts.runs} runs.`);
  const recorded: Record<string, number> = {};
  const put = (k: string, v: number | null | undefined) => {
    if (typeof v === 'number' && Number.isFinite(v)) recorded[k] = v;
  };
  put('lcp_ms', metrics.lcpMs);
  put('cls', metrics.cls);
  put('tbt_ms', metrics.tbtMs);
  put('fcp_ms', metrics.fcpMs);
  put('tti_ms', metrics.ttiMs);
  put('performance_score', metrics.performanceScore ?? undefined);
  await recordRun(dir, { runId, kind: 'web_vitals', subject: redactUrl(opts.url), metrics: recorded });
  return {
    runId,
    url: redactUrl(opts.url),
    formFactor: opts.formFactor,
    ...extra,
    metrics,
    ...(opts.runs > 1 ? { runs: perRun } : {}),
    ratings: rate(metrics),
    artifacts,
    notes,
  };
}

/** Google's Core Web Vitals thresholds. */
function rate(m: VitalsMetrics) {
  const r = (v: number | null, good: number, poor: number) => (v === null ? 'n/a' : v <= good ? 'good' : v <= poor ? 'needs-improvement' : 'poor');
  return {
    lcp: r(m.lcpMs, 2500, 4000),
    cls: r(m.cls, 0.1, 0.25),
    tbt: r(m.tbtMs, 200, 600),
    fcp: r(m.fcpMs, 1800, 3000),
  };
}
