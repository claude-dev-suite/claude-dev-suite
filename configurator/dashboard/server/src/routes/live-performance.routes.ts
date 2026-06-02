// SPDX-License-Identifier: MIT
/**
 * Live Performance Routes
 *
 * Manages per-environment app configuration and reachability checks
 * for runtime performance analysis.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { Router, type Request, type Response } from 'express';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';
import type { ApiResponse } from '../types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('LivePerformance');

export interface AppEnvironment {
  id: string;
  name: string;
  type: 'development' | 'staging' | 'production';
  appUrl: string;
  frontendUrl?: string;
  notes?: string;
}

interface LiveConfig {
  environments: AppEnvironment[];
}

const CONFIG_FILENAME = '.dev-suite-live.json';

function getConfigPath(projectPath: string): string {
  return path.join(projectPath, CONFIG_FILENAME);
}

function readConfig(projectPath: string): LiveConfig {
  const configPath = getConfigPath(projectPath);
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as LiveConfig;
    }
  } catch {
    logger.warn('Failed to read live-performance config', { configPath });
  }
  return { environments: [] };
}

function writeConfig(projectPath: string, config: LiveConfig): void {
  const configPath = getConfigPath(projectPath);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

function checkUrl(url: string): Promise<{ reachable: boolean; statusCode?: number; latencyMs?: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const client = url.startsWith('https') ? https : http;
    try {
      const req = client.get(url, { timeout: 3000 } as http.RequestOptions, (res) => {
        const latencyMs = Date.now() - start;
        resolve({ reachable: true, statusCode: res.statusCode, latencyMs });
        res.resume();
      });
      req.on('error', () => resolve({ reachable: false }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ reachable: false });
      });
    } catch {
      resolve({ reachable: false });
    }
  });
}

/**
 * Auto-detect app environments from .env files in the project.
 * Looks for SERVER_PORT, PORT, VITE_PORT, FRONTEND_PORT, APP_URL etc.
 */
function detectFromEnvFiles(projectPath: string): AppEnvironment[] {
  const suggested: AppEnvironment[] = [];
  const envFiles = [
    { file: '.env', type: 'development' as const },
    { file: '.env.local', type: 'development' as const },
    { file: '.env.development', type: 'development' as const },
    { file: '.env.staging', type: 'staging' as const },
    { file: '.env.production', type: 'production' as const },
    { file: '.env.prod', type: 'production' as const },
  ];

  for (const { file, type } of envFiles) {
    const filePath = path.join(projectPath, file);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      const getVar = (name: string): string | undefined => {
        for (const line of lines) {
          const match = line.match(new RegExp(`^${name}\\s*=\\s*(.+)$`));
          if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, '');
        }
        return undefined;
      };

      const appUrl = getVar('APP_URL') || getVar('API_URL') || getVar('BACKEND_URL');
      const port = getVar('SERVER_PORT') || getVar('PORT') || getVar('APP_PORT');
      const frontendPort = getVar('VITE_PORT') || getVar('FRONTEND_PORT') || getVar('NEXT_PUBLIC_PORT');

      const resolvedAppUrl = appUrl || (port ? `http://localhost:${port}` : undefined);
      const resolvedFrontendUrl = frontendPort ? `http://localhost:${frontendPort}` : undefined;

      if (resolvedAppUrl) {
        suggested.push({
          id: `detected-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: `${type.charAt(0).toUpperCase() + type.slice(1)} (from ${file})`,
          type,
          appUrl: resolvedAppUrl,
          frontendUrl: resolvedFrontendUrl,
        });
      }
    } catch {
      logger.warn('Failed to parse env file', { filePath });
    }
  }

  // Deduplicate by appUrl
  const seen = new Set<string>();
  return suggested.filter((env) => {
    if (seen.has(env.appUrl)) return false;
    seen.add(env.appUrl);
    return true;
  });
}

export const livePerformanceRoutes = Router();

// GET /api/live-performance/environments
livePerformanceRoutes.get('/live-performance/environments', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const config = readConfig(projectPath);
    const response: ApiResponse = { success: true, data: { environments: config.environments } };
    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to read environments',
    };
    return res.status(500).json(response);
  }
});

// POST /api/live-performance/environments
livePerformanceRoutes.post('/live-performance/environments', (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, environments } = req.body as {
      projectPath: string;
      environments: AppEnvironment[];
    };

    if (!Array.isArray(environments)) {
      return res.status(400).json({ success: false, error: 'environments must be an array' });
    }

    const projectPath = resolveProjectPath(rawPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    // Sanitize: only allow safe fields
    const sanitized: AppEnvironment[] = environments.map((env) => ({
      id: typeof env.id === 'string' ? env.id : `env-${Date.now()}`,
      name: String(env.name || '').slice(0, 100),
      type: ['development', 'staging', 'production'].includes(env.type) ? env.type : 'development',
      appUrl: String(env.appUrl || '').slice(0, 500),
      frontendUrl: env.frontendUrl ? String(env.frontendUrl).slice(0, 500) : undefined,
      notes: env.notes ? String(env.notes).slice(0, 500) : undefined,
    }));

    writeConfig(projectPath, { environments: sanitized });
    logger.info('Saved live-performance environments', { count: sanitized.length, projectPath });

    const response: ApiResponse = { success: true, data: { environments: sanitized } };
    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save environments',
    };
    return res.status(500).json(response);
  }
});

// GET /api/live-performance/status  ?path=...&url=...
livePerformanceRoutes.get('/live-performance/status', async (req: Request, res: Response) => {
  try {
    const rawUrl = req.query.url as string;
    if (!rawUrl) {
      return res.status(400).json({ success: false, error: 'url query param required' });
    }

    // Basic URL validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid URL' });
    }

    // Only allow http/https
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ success: false, error: 'Only http/https URLs allowed' });
    }

    // SSRF protection: block link-local (AWS metadata, APIPA), private RFC1918
    // ranges, and IPv6 private/unspecified ranges.
    //
    // INTENTIONAL LOOPBACK ALLOWANCE: localhost / 127.0.0.1 / ::1 are
    // explicitly allowed because this dashboard is a developer tool and devs
    // routinely run their apps on loopback ports.  The dashboard server itself
    // already binds only to 127.0.0.1 so it can never be reached from the
    // network, making SSRF via loopback a low-risk, high-value tradeoff.
    const rawHostname = parsedUrl.hostname;
    if (!rawHostname) {
      return res.status(400).json({ success: false, error: 'Invalid URL: missing hostname' });
    }

    // Node's URL parser wraps IPv6 in brackets and may normalise the form, e.g.
    // [::ffff:10.0.0.1] → hostname "[::ffff:a00:1]" (hex encoding).
    // Strip the brackets to get the raw address string.
    const hostname = rawHostname.replace(/^\[|\]$/g, '');

    // IPv4-mapped IPv6 (::ffff:xxxx:xxxx or ::ffff:d.d.d.d).
    // Node's URL normalises the last 32 bits to hex (e.g. 10.0.0.1 → a00:1).
    // Block ALL ::ffff: addresses except the IPv4-mapped loopback (::ffff:7f00:1
    // = 127.0.0.1) which is equivalent to the loopback we intentionally allow.
    const isIpv4Mapped = /^::ffff:/i.test(hostname);

    // Attempt to recover a dotted-decimal IPv4 from the mapped address (both
    // dotted-decimal and hex forms) for the private-range checks below.
    let effectiveHostname: string = hostname;
    if (isIpv4Mapped) {
      // Dotted-decimal form: ::ffff:a.b.c.d
      const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(hostname);
      if (dotted && dotted[1]) {
        effectiveHostname = dotted[1];
      } else {
        // Hex form: ::ffff:xxyy:zzww → convert to a.b.c.d
        const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(hostname);
        if (hex && hex[1] && hex[2]) {
          const hi = parseInt(hex[1], 16);
          const lo = parseInt(hex[2], 16);
          effectiveHostname = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        }
      }
    }

    // Loopback (intentionally allowed — see comment above).
    const isLoopback =
      effectiveHostname === '127.0.0.1' ||
      effectiveHostname === 'localhost' ||
      effectiveHostname === '::1' ||
      hostname === '::1' ||
      /^127\.\d+\.\d+\.\d+$/.test(effectiveHostname);

    // IPv4 link-local and unspecified.
    const isLinkLocalV4 = /^169\.254\./.test(effectiveHostname);
    const isUnspecifiedV4 = /^0\.0\.0\.0$/.test(effectiveHostname);

    // RFC1918 private ranges.
    const isPrivateV4 =
      /^10\./.test(effectiveHostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(effectiveHostname) ||
      /^192\.168\./.test(effectiveHostname);

    // Any ::ffff: mapped address that is not loopback must be blocked (it
    // is equivalent to one of the IPv4 ranges we block above, or to some
    // other non-routable address).
    const isBlockedIpv4Mapped = isIpv4Mapped && !isLoopback;

    // IPv6 ULA (fc00::/7 covers fc** and fd**) and unspecified (::).
    const isUlaV6 = /^f[cd][0-9a-f]{2}:/i.test(hostname);
    const isUnspecifiedV6 = /^::$/.test(hostname) || hostname === '0:0:0:0:0:0:0:0';

    // Link-local IPv6 (fe80::/10).
    const isLinkLocalV6 = /^fe[89ab][0-9a-f]:/i.test(hostname);

    const isBlocked = !isLoopback && (
      isLinkLocalV4 || isUnspecifiedV4 || isPrivateV4 ||
      isBlockedIpv4Mapped ||
      isUlaV6 || isUnspecifiedV6 || isLinkLocalV6
    );

    if (isBlocked) {
      return res.status(400).json({ success: false, error: 'URL host not allowed' });
    }

    const result = await checkUrl(rawUrl);
    const response: ApiResponse = { success: true, data: result };
    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to check status',
    };
    return res.status(500).json(response);
  }
});

// GET /api/live-performance/detect?path=...
livePerformanceRoutes.get('/live-performance/detect', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const suggested = detectFromEnvFiles(projectPath);
    logger.info('Auto-detected environments', { count: suggested.length, projectPath });

    const response: ApiResponse = { success: true, data: { suggested } };
    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to detect environments',
    };
    return res.status(500).json(response);
  }
});
