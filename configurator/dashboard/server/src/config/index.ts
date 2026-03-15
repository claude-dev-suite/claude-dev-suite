// SPDX-License-Identifier: MIT
/**
 * Backend Configuration
 *
 * Centralized configuration for the dashboard server.
 * All hardcoded values should be moved here.
 */

export const config = {
  server: {
    /**
     * HTTP server port
     */
    port: parseInt(process.env.PORT || '3456', 10),
    /**
     * Server host (localhost only for security)
     */
    host: process.env.HOST || '127.0.0.1',
  },
  websocket: {
    /**
     * WebSocket server port
     */
    port: parseInt(process.env.ORCHESTRATOR_WS_PORT || '3457', 10),
    /**
     * WebSocket server host (localhost only for security)
     */
    host: process.env.WS_HOST || '127.0.0.1',
    /**
     * Rate limiting for WebSocket messages
     */
    rateLimit: {
      /**
       * Maximum messages per window
       */
      maxMessages: 60,
      /**
       * Rate limit window in milliseconds (1 minute)
       */
      windowMs: 60000,
    },
  },
  orchestrator: {
    /**
     * Maximum conversation turns
     */
    maxTurns: 50,
    /**
     * Maximum budget in USD
     */
    maxBudgetUsd: 5,
    /**
     * Maximum message length (characters)
     */
    maxMessageLength: 50000,
  },
  rateLimit: {
    /**
     * API rate limit window (1 minute)
     */
    windowMs: 1 * 60 * 1000,
    /**
     * Maximum requests per window
     */
    maxRequests: 100,
  },
  security: {
    /**
     * WebSocket token expiry (24 hours)
     */
    wsTokenMaxAge: 24 * 60 * 60 * 1000,
    /**
     * Token cleanup interval (5 minutes)
     */
    tokenCleanupInterval: 5 * 60 * 1000,
    /**
     * Request body size limit
     */
    bodySizeLimit: '10mb',
  },
  cors: {
    /**
     * Allowed origins (localhost only)
     */
    origins: [
      'http://localhost:3456',
      'http://127.0.0.1:3456',
      // Vite dev server ports (tries multiple if occupied)
      ...Array.from({ length: 10 }, (_, i) => `http://localhost:${5173 + i}`),
      ...Array.from({ length: 10 }, (_, i) => `http://127.0.0.1:${5173 + i}`),
    ] as string[],
  },
};
