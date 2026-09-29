// SPDX-License-Identifier: MIT
/**
 * Integration tests against the real bundle and real tools. Each block
 * auto-skips when what it needs is absent (no dist build, tool not on PATH).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { defaultResolver } from '../src/utils/exec.js';
import { scanIac } from '../src/scanners/container.js';
import { scanSecrets } from '../src/scanners/secrets.js';

const dist = join(__dirname, '..', 'dist', 'index.js');
const has = (bin: string) => defaultResolver(bin) !== null;

describe.skipIf(!existsSync(dist))('bundled dist/index.js over stdio', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'secscan-bundle-'));
    copyFileSync(dist, join(dir, 'server.mjs')); // no node_modules anywhere near it
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('initializes and lists every tool with no node_modules present', async () => {
    const child = spawn(process.execPath, [join(dir, 'server.mjs')], { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    const responses = new Map<number, any>();
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) {
          const msg = JSON.parse(line);
          responses.set(msg.id, msg);
        }
      }
    });
    const send = (m: object) => child.stdin.write(JSON.stringify(m) + '\n');
    const wait = async (id: number) => {
      for (let i = 0; i < 200 && !responses.has(id); i++) await new Promise((r) => setTimeout(r, 25));
      return responses.get(id);
    };
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
    const init = await wait(1);
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const list = await wait(2);
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'scan_code', arguments: { path: 'relative/path' } } });
    const bad = await wait(3);
    child.kill();
    expect(init.result.serverInfo.name).toBe('security-scanner');
    expect(list.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(
      ['check_tools', 'generate_sbom', 'scan_all', 'scan_code', 'scan_container', 'scan_dependencies', 'scan_iac', 'scan_licenses', 'scan_secrets'].sort()
    );
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toMatch(/absolute/);
  }, 20000);
});

describe.skipIf(!has('trivy'))('real trivy', () => {
  it('finds a Dockerfile misconfiguration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'secscan-iac-'));
    try {
      writeFileSync(join(dir, 'Dockerfile'), 'FROM ubuntu:latest\nRUN apt-get update\n');
      const r = await scanIac({ path: dir, timeoutSeconds: 300 });
      expect(r.status).toBe('ok');
      expect(r.findings.some((f) => f.location.file === 'Dockerfile')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 320000);
});

describe.skipIf(!has('gitleaks'))('real gitleaks', () => {
  it('finds a key in the working tree with a relative path and no secret in the output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'secscan-gl-'));
    try {
      const key = 'AKIA' + 'Q3EGUIWPLHZ6S2VR';
      writeFileSync(join(dir, 'config.env'), `AWS_ACCESS_KEY_ID=${key}\n`);
      const r = await scanSecrets({ path: dir, tool: 'gitleaks' });
      expect(r.status).toBe('ok');
      expect(r.findings[0]).toMatchObject({ id: 'aws-access-token', severity: 'CRITICAL', location: { file: 'config.env', line: 1 } });
      expect(JSON.stringify(r)).not.toContain(key);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
