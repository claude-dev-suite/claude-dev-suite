// SPDX-License-Identifier: MIT
/**
 * Express server setup with security and middleware
 *
 * Security Note: This server is designed to run ONLY on localhost (127.0.0.1).
 * It has NO authentication and should NEVER be exposed on a network.
 * CSRF protection is not needed for localhost-only tools.
 */

import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID, randomBytes } from 'crypto';
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

export function createServer(): Express {
  const app = express();

  // Request logging middleware (MUST be first to track all requests)
  app.use(requestLogger);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws://localhost:*", "ws://127.0.0.1:*"],
        fontSrc: ["'self'"],
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

  // Error handling middleware (MUST be last)
  // Note: This is replaced by errorLogger middleware which provides better logging
  app.use(errorLogger);

  return app;
}

/**
 * Validate WebSocket token
 * Prevents unauthorized WebSocket connections
 */
export function validateWsToken(token: string): boolean {
  for (const [, data] of wsTokens.entries()) {
    if (data.wsToken === token) {
      return true;
    }
  }
  return false;
}
