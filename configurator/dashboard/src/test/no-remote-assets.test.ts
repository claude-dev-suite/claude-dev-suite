/**
 * The dashboard must not fetch anything from a third party to render itself.
 *
 * It is a desktop app that loads its UI from disk, but `index.html` used to
 * carry a `<link>` to fonts.googleapis.com — so opening it made the user's
 * machine contact Google on every launch, and running it offline silently
 * degraded to system fallbacks. The fonts are bundled now (see `main.tsx`).
 *
 * This guards the reintroduction, which is easy: a designer adds one `<link>`,
 * or a CSP is relaxed "to make the font work". Both halves are checked, because
 * either one alone is enough to put the request back.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

const dashboardRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...segments: string[]) =>
  fs.readFileSync(path.join(dashboardRoot, ...segments), 'utf-8');

/** Hosts that serve assets a page renders itself with, rather than data it asks for. */
const REMOTE_ASSET_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
];

describe('index.html', () => {
  const html = read('index.html');

  it.each(REMOTE_ASSET_HOSTS)('does not reference %s', (host) => {
    expect(html).not.toContain(host);
  });

  it('has no external stylesheet or preconnect at all', () => {
    expect(html).not.toMatch(/<link[^>]+rel=["']?(stylesheet|preconnect)/i);
  });
});

describe('content security policy', () => {
  // Both surfaces set their own: Express serves the built SPA, and Electron
  // injects headers for the window. A host allowed in either one is a host the
  // app can reach, so neither may list a remote asset origin.
  const sources: [string, string][] = [
    ['server (helmet)', read('server', 'src', 'server.ts')],
    ['electron (header injection)', read('electron', 'main.cjs')],
  ];

  for (const [label, source] of sources) {
    it.each(REMOTE_ASSET_HOSTS)(`${label} does not allow %s`, (host) => {
      expect(source).not.toContain(host);
    });
  }
});
