// SPDX-License-Identifier: MIT
/**
 * Static hosting for the built dashboard UI.
 *
 * This Express app is otherwise a pure JSON API: the Electron desktop app loads
 * the Vite bundle itself with `loadFile()` and only talks to the server over
 * `/api`. The browser entry points (`init-project.sh` / `init-project.ps1`) have
 * no such shell, so when a production build exists next to the server we serve
 * it from here and let the SPA handle client-side routing.
 *
 * Mount this AFTER `registerRoutes()` — the SPA fallback deliberately claims
 * every GET that is not an API route.
 */

import express, { type Express } from 'express';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from './utils/logger.js';

const logger = getLogger('Frontend');

/**
 * Resolve `configurator/dashboard/dist`, the Vite build output.
 *
 * Works from both `server/src` (tsx dev) and `server/dist` (built), which sit at
 * the same depth, plus one extra level up for packaged layouts.
 */
export function resolveFrontendDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '..', '..', 'dist'),
    path.resolve(here, '..', '..', '..', 'dist'),
  ];
  return candidates.find((dir) => existsSync(path.join(dir, 'index.html'))) ?? null;
}

/** True for requests the API owns; the SPA fallback must not swallow these. */
function isApiRequest(pathname: string): boolean {
  return pathname === '/health' || pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * Serve the built UI, or an explanatory 503 when it has not been built.
 *
 * Returns whether a build was found, so the caller can log the right URL.
 */
export function mountFrontend(app: Express): boolean {
  const dir = resolveFrontendDir();

  if (!dir) {
    logger.warn('Dashboard UI build not found — serving the API only', {
      hint: 'run `npm run build` in configurator/dashboard',
    });
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (isApiRequest(req.path)) return next();
      res
        .status(503)
        .type('text/plain')
        .send(
          'Dev-Suite dashboard UI has not been built.\n\n' +
            'Run:  cd configurator/dashboard && npm install && npm run build\n' +
            'Then restart this server. The JSON API is available under /api.\n'
        );
    });
    return false;
  }

  logger.info('Serving dashboard UI', { dir });

  // Hashed asset filenames make them immutable; index.html must never be cached
  // or a rebuilt UI keeps loading the previous bundle.
  app.use(express.static(dir, { index: false, maxAge: '1h' }));

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (isApiRequest(req.path)) return next();
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(dir, 'index.html'));
  });

  return true;
}
