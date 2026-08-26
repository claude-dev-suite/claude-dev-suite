// SPDX-License-Identifier: MIT
/**
 * Dashboard Server Entry Point
 * 
 * Starts HTTP server on port 3456 and WebSocket server on port 3457
 */

import { createServer, installErrorHandler } from './server.js';
import { createWebSocketServer } from './websocket.js';
import { registerRoutes } from './routes/index.js';
import { mountFrontend } from './frontend.js';
import { getLogger } from './utils/logger.js';
import { config } from './config/index.js';

const logger = getLogger('Main');

const HTTP_PORT = config.server.port;
const WS_PORT = config.websocket.port;
const HOST = config.server.host;

async function main() {
  logger.info('Starting Dev-Suite Dashboard Server');

  // Security check: warn if exposing on network
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    logger.warn('SECURITY RISK DETECTED', {
      host: HOST,
      message: 'Server binding to non-localhost address exposes it beyond local machine',
      recommendation: 'Remove HOST environment variable or set HOST=127.0.0.1'
    });
  }

  // Create Express app
  const app = createServer();

  // Register API routes
  registerRoutes(app);

  // Serve the built dashboard UI (browser entry point). Must come after the API
  // routes: the SPA fallback claims every remaining GET.
  const uiServed = mountFrontend(app);

  // Error handler last of all — Express dispatches error middleware in
  // registration order, so anything mounted after it is never covered.
  installErrorHandler(app);

  // Start HTTP server - bind to localhost only for security
  const httpServer = app.listen(HTTP_PORT, HOST, () => {
    logger.info('HTTP server started', {
      url: `http://${HOST}:${HTTP_PORT}`,
      serving: uiServed ? 'dashboard UI + API' : 'API only (UI not built)',
    });
    if (HOST === '127.0.0.1' || HOST === 'localhost') {
      logger.info('Security: Server bound to localhost only');
    }
  });

  // Start WebSocket server - bind to localhost only for security
  const wss = createWebSocketServer(WS_PORT, HOST);
  logger.info('WebSocket server started', { url: `ws://${HOST}:${WS_PORT}` });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutdown initiated');

    wss.close(() => {
      logger.info('WebSocket server closed');
    });

    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force exit after 5 seconds
    setTimeout(() => {
      logger.warn('Forcing exit after timeout');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('Fatal error during startup', { error: err });
  process.exit(1);
});
