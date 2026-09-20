// SPDX-License-Identifier: MIT
/**
 * One command: fixture → dashboard → recording → GIF + MP4.
 *
 *   npm run demo
 *
 * Everything downstream of this is generated, so when the wizard changes the
 * README asset is one command away from being current again. That is the whole
 * point: a hand-recorded demo of a catalog that grows every release is stale the
 * week after it ships, and nobody re-records it.
 *
 * Prerequisites: the dashboard server and UI must be built, and ffmpeg/ffprobe
 * on PATH. Both are checked below rather than failing halfway through.
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoProject } from './fixture-project.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD = path.resolve(__dirname, '..');
const DEV_SUITE_ROOT = path.resolve(DASHBOARD, '../..');
const SERVER_ENTRY = path.join(DASHBOARD, 'server', 'dist', 'index.js');
const UI_ENTRY = path.join(DASHBOARD, 'dist', 'index.html');

function die(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

// ── preflight ──────────────────────────────────────────────────────────────
if (!fs.existsSync(SERVER_ENTRY)) die(`Dashboard server not built.\n  cd server && npm run build`);
if (!fs.existsSync(UI_ENTRY)) die(`Dashboard UI not built.\n  npm run build`);
for (const bin of ['ffmpeg', 'ffprobe']) {
  try {
    execFileSync(bin, ['-version'], { stdio: 'pipe' });
  } catch {
    die(`${bin} is not on PATH. It is required to assemble the GIF.`);
  }
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });

const waitForServer = async (port, ms = 60_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${port}/`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dashboard did not answer on :${port} within ${ms}ms`);
};

// ── run ────────────────────────────────────────────────────────────────────
console.log('1/4  building the fixture project');
const project = createDemoProject();
console.log(`     ${project}`);

const port = await freePort();
const wsPort = await freePort();

console.log(`2/4  starting the dashboard on :${port}`);
const server = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: path.join(DASHBOARD, 'server'),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    DEV_SUITE_DIR: DEV_SUITE_ROOT,
    DEV_SUITE_PROJECT_PATH: project,
    PORT: String(port),
    ORCHESTRATOR_WS_PORT: String(wsPort),
  },
  stdio: 'ignore',
});

let exitCode = 0;
try {
  await waitForServer(port);

  console.log('3/4  recording');
  execFileSync(process.execPath, [path.join(__dirname, 'record-demo.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port), DEMO_PROJECT: project },
  });

  console.log('4/4  encoding');
  execFileSync(process.execPath, [path.join(__dirname, 'make-gif.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, DEMO_WIDTH: process.env.DEMO_WIDTH ?? '1280', DEMO_GIF_FPS: process.env.DEMO_GIF_FPS ?? '20' },
  });
} catch (err) {
  console.error(`\nfailed: ${err.message}`);
  exitCode = 1;
} finally {
  server.kill();
  // The fixture is outside the repo; leave it unless asked, so a failed run can
  // be inspected. DEMO_KEEP=0 removes it.
  if (process.env.DEMO_KEEP === '0') fs.rmSync(project, { recursive: true, force: true });
}

process.exit(exitCode);
