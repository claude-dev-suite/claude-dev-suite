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

    // SSRF protection: block link-local (AWS metadata, APIPA) and private RFC1918 ranges.
    // localhost / 127.0.0.1 are intentionally allowed — devs run their apps there.
    const hostname = parsedUrl.hostname;
    if (!hostname) {
      return res.status(400).json({ success: false, error: 'Invalid URL: missing hostname' });
    }
    const isLinkLocal = /^169\.254\.|^0\.0\.0\.0$|^::$/.test(hostname);
    const isPrivate = /^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./.test(hostname);
    const isLoopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
    if (isLinkLocal || (isPrivate && !isLoopback)) {
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
