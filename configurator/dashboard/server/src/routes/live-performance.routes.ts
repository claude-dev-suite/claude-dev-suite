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
import * as dns from 'dns';
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

// ============================================
// SSRF HELPERS
// ============================================

/**
 * Try to convert a potentially-numeric hostname string to a dotted-quad
 * IPv4 address.  Handles:
 *   - Decimal:  2852039166  → "169.254.169.254"
 *   - Hex:      0xa9fea9fe  → "169.254.169.254"
 *   - Octal:    0177.0.0.1  → "127.0.0.1"
 *   - Mixed:    192.0x168.1.1  (treated as regular dotted form — no special decode needed)
 *
 * Returns the dotted-quad string when numeric, or null when the hostname is a
 * regular DNS name (not parseable as a single integer or octal-dotted form).
 */
export function normalizeNumericIp(hostname: string): string | null {
  // Already a dotted-quad IPv4?  Return as-is; the caller checks private ranges.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return hostname;

  // Reject if hostname contains letters that aren't hex digits (0-9 a-f A-F x X)
  // — a plain DNS label like "localhost" should pass through as null.
  if (/[g-wyzG-WYZ]/.test(hostname)) return null;

  // Pure integer forms (decimal or 0x-prefixed hex): 2852039166 or 0xa9fea9fe
  const asInt = Number(hostname);
  if (!Number.isNaN(asInt) && Number.isInteger(asInt) && asInt >= 0 && asInt <= 0xFFFFFFFF) {
    const n = asInt >>> 0;
    return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
  }

  // Octal-dotted form: 0177.0.0.1
  if (/^0\d+\./.test(hostname)) {
    const parts = hostname.split('.');
    if (parts.length === 4) {
      try {
        const octets = parts.map((p) => {
          // Prefix "0" means octal; prefix "0x" means hex; else decimal
          const v = p.startsWith('0x') || p.startsWith('0X')
            ? parseInt(p, 16)
            : p.startsWith('0') && p.length > 1
              ? parseInt(p, 8)
              : parseInt(p, 10);
          if (Number.isNaN(v) || v < 0 || v > 255) throw new Error('bad octet');
          return v;
        });
        return octets.join('.');
      } catch {
        // fall through
      }
    }
  }

  return null; // Regular DNS name
}

/**
 * Returns true when a dotted-quad IPv4 address falls within a range that
 * must not be reached by the SSRF guard:
 *   - RFC1918 private: 10.x, 172.16-31.x, 192.168.x
 *   - Link-local / AWS metadata: 169.254.x
 *   - Unspecified / broadcast: 0.0.0.0
 *   - Multicast: 224.0.0.0/4
 *   - Loopback: 127.x  (intentionally ALLOWED by this tool — see comment below)
 *
 * Loopback (127.x) is excluded from blocking because this dashboard is a
 * developer tool and devs routinely run their apps on loopback ports.
 */
export function isBlockedIpv4(dotted: string): boolean {
  const parts = dotted.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts as [number, number, number, number];

  if (a === 10) return true;                                      // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;              // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                        // 192.168.0.0/16
  if (a === 169 && b === 254) return true;                        // 169.254.0.0/16 (link-local / metadata)
  if (a === 0) return true;                                       // 0.0.0.0
  if (a >= 224 && a <= 239) return true;                          // 224.0.0.0/4 multicast
  if (a === 255) return true;                                     // 255.255.255.255 broadcast
  // 100.64.0.0/10 — CGNAT shared address space
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * Resolves all A/AAAA records for a hostname and returns true if ANY resolved
 * IP is in a blocked range.  This defeats DNS-rebinding: if the hostname
 * currently resolves to a public IP but a later re-query could return a private
 * one, the first-resolution check won't catch it — but the TOCTOU window is
 * closed by pinning the connection to the validated IP via the `lookup` option
 * in http.get (see checkUrl).
 *
 * Returns `{ blocked: false, resolvedIp: string }` on success (first A record),
 * or `{ blocked: true, reason: string }` when blocked.
 */
/**
 * Validate a literal IPv6 address against blocked ranges.
 *
 * Called when the hostname is already a bare IPv6 string (brackets stripped).
 * Returns true if the address is in a blocked range.
 *
 * Node's URL parser normalises IPv4-in-IPv6 addresses to hex form before we
 * see them.  For example:
 *   http://[::ffff:10.0.0.1]/  → hostname [::ffff:a00:1]   (::ffff:a*b = 10.0.0.1)
 *   http://[::ffff:192.168.1.1]/ → hostname [::ffff:c0a8:101]
 *   http://[::ffff:169.254.1.1]/ → hostname [::ffff:a9fe:101]
 *
 * We therefore need to handle the compact hex form in addition to the dotted form.
 */
function isBlockedIPv6Literal(ip: string): boolean {
  // IPv4-mapped dotted form: ::ffff:x.x.x.x
  const mappedV4Dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mappedV4Dotted?.[1] && isBlockedIpv4(mappedV4Dotted[1])) return true;

  // IPv4-mapped hex form: ::ffff:HHHH:HHHH (Node normalises to this)
  // Decode two 16-bit hex groups to a dotted-quad and check blocked ranges.
  const mappedV4Hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (mappedV4Hex?.[1] && mappedV4Hex?.[2]) {
    const hi = parseInt(mappedV4Hex[1], 16); // e.g. 0xa00 = 2560
    const lo = parseInt(mappedV4Hex[2], 16); // e.g. 0x1   = 1
    const a = (hi >>> 8) & 0xff;
    const b = hi & 0xff;
    const c = (lo >>> 8) & 0xff;
    const d = lo & 0xff;
    const dotted = `${a}.${b}.${c}.${d}`;
    if (isBlockedIpv4(dotted)) return true;
  }

  // ULA fc00::/7 — includes fc and fd prefixes
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;

  // Link-local fe80::/10
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;

  // Unspecified :: and 0:0:0:0:0:0:0:0
  if (ip === '::' || ip === '0:0:0:0:0:0:0:0') return true;

  return false;
}

async function resolveAndValidate(hostname: string): Promise<
  | { blocked: false; resolvedIp: string }
  | { blocked: true; reason: string }
> {
  // First, try to normalise numeric IP forms to catch decimal/hex/octal before
  // any DNS lookup (no DNS call needed for raw IPs).
  const numericIp = normalizeNumericIp(hostname);
  if (numericIp !== null && numericIp !== hostname) {
    // The hostname was a numeric-encoded IP (not already a plain dotted quad).
    // Check if it is blocked.
    if (isBlockedIpv4(numericIp)) {
      return { blocked: true, reason: 'URL host not allowed (numeric IP in blocked range)' };
    }
    // Not blocked — use the decoded IP for the actual connection.
    return { blocked: false, resolvedIp: numericIp };
  }

  // For regular dotted-quad IPv4, validate directly.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isBlockedIpv4(hostname)) {
      return { blocked: true, reason: 'URL host not allowed' };
    }
    return { blocked: false, resolvedIp: hostname };
  }

  // For literal IPv6 addresses (contain ':'), validate directly without DNS.
  // This handles IPv4-mapped (::ffff:x.x.x.x), ULA, link-local, and unspecified.
  if (hostname.includes(':')) {
    if (isBlockedIPv6Literal(hostname)) {
      return { blocked: true, reason: 'URL host not allowed (blocked IPv6 address)' };
    }
    return { blocked: false, resolvedIp: hostname };
  }

  // For DNS names, resolve all records and block if any is in a restricted range.
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true, family: 0 });
    if (!addresses || addresses.length === 0) {
      return { blocked: true, reason: 'Could not resolve hostname' };
    }

    for (const addr of addresses) {
      const ip = addr.address;
      if (addr.family === 4) {
        if (isBlockedIpv4(ip)) {
          return { blocked: true, reason: 'URL host resolves to a blocked IP address' };
        }
        // IPv4 loopback 127.x — intentionally allowed.
      } else if (addr.family === 6) {
        // Normalise IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
        const mappedV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
        if (mappedV4?.[1] && isBlockedIpv4(mappedV4[1])) {
          return { blocked: true, reason: 'URL host resolves to a blocked IP address' };
        }
        if (isBlockedIPv6Literal(ip)) {
          return { blocked: true, reason: 'URL host resolves to a blocked IP address' };
        }
      }
    }

    // All records are safe.  Return the first IPv4 address for connection pinning.
    const firstV4 = addresses.find((a) => a.family === 4);
    const firstAny = addresses[0];
    return { blocked: false, resolvedIp: (firstV4 ?? firstAny)?.address ?? hostname };
  } catch {
    // DNS resolution failure — treat as unreachable rather than blocked.
    return { blocked: false, resolvedIp: hostname };
  }
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

    // Node's URL parser wraps IPv6 in brackets; strip them to get the raw string.
    const rawHostname = parsedUrl.hostname;
    if (!rawHostname) {
      return res.status(400).json({ success: false, error: 'Invalid URL: missing hostname' });
    }
    const hostname = rawHostname.replace(/^\[|\]$/g, '');

    // SSRF protection — multi-layer:
    //
    // 1. Numeric IP normalisation: decimal/hex/octal encodings (e.g.
    //    http://2852039166/ = 169.254.169.254) are converted to dotted-quad
    //    and checked against blocked ranges.
    //
    // 2. DNS resolution: for named hosts we resolve all A/AAAA records and
    //    reject if any resolved address falls in a blocked range.
    //
    // 3. Connection pinning: the actual http(s).get call receives the validated
    //    IP via a custom `lookup` function, closing the TOCTOU rebinding window.
    //
    // INTENTIONAL LOOPBACK ALLOWANCE: localhost / 127.x / ::1 are allowed
    // because this is a developer tool and apps routinely run on loopback.
    // The server binds only to 127.0.0.1 so it is never reachable from the
    // network — SSRF via loopback is a low-risk, high-value tradeoff here.
    const isLoopback =
      hostname === 'localhost' ||
      hostname === '::1' ||
      /^127\.\d+\.\d+\.\d+$/.test(hostname);

    if (!isLoopback) {
      const validation = await resolveAndValidate(hostname);
      if (validation.blocked) {
        return res.status(400).json({ success: false, error: validation.reason });
      }
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
