// SPDX-License-Identifier: MIT
/**
 * Express server setup with security and middleware
 *
 * Security Note: This server is designed to run ONLY on localhost (127.0.0.1).
 * It has NO authentication and should NEVER be exposed on a network.
 * CSRF protection is not needed for localhost-only tools.
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID, randomBytes, timingSafeEqual } from 'crypto';
import type { ApiResponse } from './types.js';
import { config } from './config/index.js';
import { requestLogger, errorLogger } from './middleware/requestLogger.js';

/**
 * Generate a cryptographically secure token
 * Uses 32 bytes (256 bits) of randomness, encoded as hex (64 chars)
 * This is significantly stronger than UUID (128 bits)
 */
function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

// Store WebSocket tokens for connection validation
// Note: Session management is simplified for localhost-only usage
const wsTokens = new Map<string, { wsToken: string; createdAt: number }>();

// Clean up expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = config.security.wsTokenMaxAge;
  for (const [id, data] of wsTokens.entries()) {
    if (now - data.createdAt > maxAge) {
      wsTokens.delete(id);
    }
  }
}, config.security.tokenCleanupInterval);

/**
 * DNS rebinding protection middleware.
 *
 * Validates the HTTP Host header against an explicit allowlist of
 * `localhost:<port>`, `127.0.0.1:<port>`, and `[::1]:<port>`.
 *
 * A browser-based DNS-rebinding attack lets an attacker's script reach the
 * server by mapping their domain to 127.0.0.1; the forged Host header is the
 * only reliable server-side signal that the request is illegitimate.
 *
 * Missing Host (e.g. direct curl with -H '' or HTTP/1.0) is also rejected to
 * keep the check strict.
 */
function buildHostAllowlist(port: number): Set<string> {
  return new Set([
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `[::1]:${port}`,
  ]);
}

function hostValidationMiddleware(allowedHosts: Set<string>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const host = req.headers['host'];
    if (!host || !allowedHosts.has(host)) {
      res.status(400).json({ success: false, error: 'Invalid Host header' });
      return;
    }
    next();
  };
}

export function createServer(): Express {
  const app = express();

  // DNS rebinding protection — validate Host header before ANY other processing
  const allowedHosts = buildHostAllowlist(config.server.port);
  app.use(hostValidationMiddleware(allowedHosts));

  // Request logging middleware (MUST be first to track all requests)
  app.use(requestLogger);

  // Security middleware
  //
  // CSP note: this server serves the JSON API and, when a production build
  // exists, the dashboard SPA (see frontend.ts). The Vite build emits no inline
  // scripts, so 'unsafe-inline' stays out of script-src; style-src needs it
  // because React components set inline styles and shiki injects them for
  // syntax highlighting. The two Google Fonts hosts are the only remote origins
  // index.html references.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],        // no inline scripts in the Vite build
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws://localhost:*", "ws://127.0.0.1:*"],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // CORS configuration - localhost only
  app.use(cors({
    origin: config.cors.origins, // Strict localhost origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'x-request-id'],
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: { success: false, error: 'Too many requests, please try again later' },
  });
  app.use('/api/', limiter);

  // Body parsing
  app.use(express.json({ limit: config.security.bodySizeLimit }));
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // WebSocket token endpoint
  // Frontend fetches a token before establishing WebSocket connection
  // SECURITY: Uses cryptographically secure 256-bit tokens
  app.get('/api/tokens', (_req: Request, res: Response) => {
    const sessionId = randomUUID();
    const wsToken = generateSecureToken(); // 256-bit secure token

    wsTokens.set(sessionId, {
      wsToken: wsToken,
      createdAt: Date.now(),
    });

    const response: ApiResponse<{ wsToken: string; wsPort: number }> = {
      success: true,
      data: { wsToken, wsPort: config.websocket.port },
    };

    res.json(response);
  });

  return app;
}

/**
 * Install the Express error handler.
 *
 * MUST be called *after* every route and the SPA fallback are mounted. Express
 * dispatches error middleware in registration order, so registering it at the
 * end of `createServer()` — before `registerRoutes()`/`mountFrontend()` ever ran —
 * meant it sat ahead of every route and was never reached: thrown errors fell
 * through to Express's default finalhandler, which serialises the stack trace
 * into the response outside production. The M3 mitigation was inert in the real
 * app while its unit test, which calls `errorLogger` directly, kept passing.
 */
export function installErrorHandler(app: Express): void {
  app.use(errorLogger);
}

/**
 * Validate WebSocket token using a timing-safe comparison.
 *
 * SECURITY: Using `===` for secret comparison is vulnerable to timing attacks
 * that can reveal token bytes character-by-character.  `crypto.timingSafeEqual`
 * runs in constant time regardless of where (or whether) the strings differ.
 *
 * The guard on equal byte-length before calling timingSafeEqual is required
 * because timingSafeEqual throws when the buffers have different lengths —
 * which would itself leak the expected length.  We therefore pad/skip mismatches
 * silently and return false without early-exit.
 */
export function validateWsToken(token: string): boolean {
  const candidateBuf = Buffer.from(token, 'utf8');
  let found = false;
  for (const [, data] of wsTokens.entries()) {
    const storedBuf = Buffer.from(data.wsToken, 'utf8');
    // Buffers must be the same length for timingSafeEqual; skip without
    // short-circuiting so we always iterate the full map.
    if (storedBuf.length === candidateBuf.length && timingSafeEqual(storedBuf, candidateBuf)) {
      found = true;
    }
  }
  return found;
}
