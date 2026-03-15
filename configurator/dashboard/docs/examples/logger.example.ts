/**
 * Logger Usage Examples
 *
 * This file demonstrates how to use the comprehensive logging service.
 * This is for documentation purposes only - not imported in production code.
 */

import {
  serverLogger,
  wsLogger,
  apiLogger,
  serviceLogger,
  getLogger,
  createRequestLogger,
  requestLoggingMiddleware,
  generateCorrelationId,
  getLogDirectoryPath,
  type Logger,
  type LogContext,
} from './logger.js';

/**
 * Example 1: Basic Logging
 */
function basicLoggingExample() {
  // Simple log messages
  serverLogger.info('Server starting on port 3456');
  serverLogger.warn('Cache is disabled');
  serverLogger.error('Failed to connect to database');
  serverLogger.debug('Debug information');
  serverLogger.http('HTTP request received');
}

/**
 * Example 2: Logging with Context Data
 */
function loggingWithDataExample() {
  serverLogger.info('User logged in', {
    data: {
      userId: '12345',
      username: 'john.doe',
      ip: '192.168.1.1',
    },
  });

  // Sensitive data will be automatically redacted
  serverLogger.info('Authentication attempt', {
    data: {
      username: 'john.doe',
      password: 'secret123', // Will be redacted to [REDACTED]
      token: 'abc123xyz', // Will be redacted to [REDACTED]
    },
  });
}

/**
 * Example 3: Error Logging with Stack Traces
 */
function errorLoggingExample() {
  try {
    throw new Error('Something went wrong');
  } catch (error) {
    serverLogger.error('Operation failed', {
      error,
      data: {
        operation: 'processData',
        input: { id: 123 },
      },
    });
  }
}

/**
 * Example 4: Component-Specific Loggers
 */
function componentLoggersExample() {
  // Use pre-configured loggers
  wsLogger.info('WebSocket connection established');
  apiLogger.http('GET /api/projects');
  serviceLogger.debug('Cache hit for key: projects:123');

  // Create custom logger
  const dbLogger = getLogger('Database');
  dbLogger.info('Connection pool initialized');
  dbLogger.debug('Query executed', {
    data: {
      query: 'SELECT * FROM users',
      duration: 45,
    },
  });
}

/**
 * Example 5: Child Loggers with Context
 */
function childLoggerExample() {
  const correlationId = generateCorrelationId();

  const parentLogger = getLogger('Service', {
    correlationId,
    userId: '12345',
  });

  // All logs will include correlationId and userId
  parentLogger.info('Processing request');

  // Create child logger with additional context
  const childLogger = parentLogger.createChildLogger({
    operation: 'validateInput',
  });

  // Inherits parent context and adds operation
  childLogger.debug('Validating input data');
  childLogger.info('Validation successful');
}

/**
 * Example 6: Performance Timing
 */
async function performanceTimingExample() {
  const logger = getLogger('API');

  // Time a synchronous operation
  const endTimer = logger.time('processData');
  // ... do some work ...
  endTimer(); // Logs duration automatically

  // Time an async operation
  const endAsyncTimer = logger.time('fetchFromDatabase');
  try {
    // await fetchData();
    endAsyncTimer(); // Logs success with duration
  } catch (error) {
    endAsyncTimer(); // Still logs duration even on error
    logger.error('Fetch failed', { error });
  }
}

/**
 * Example 7: Request-Scoped Logging
 */
function requestScopedLoggingExample() {
  // In Express middleware or route handler
  const correlationId = generateCorrelationId();
  const requestLogger = createRequestLogger(correlationId);

  requestLogger.http('Processing request', {
    data: {
      method: 'GET',
      path: '/api/projects',
      query: { page: 1 },
    },
  });

  // All subsequent logs in this request context will have the correlationId
  requestLogger.debug('Fetching projects from database');
  requestLogger.info('Request completed successfully');
}

/**
 * Example 8: Express Middleware Integration
 */
function expressMiddlewareExample() {
  // In your Express app setup
  // app.use(requestLoggingMiddleware());

  // The middleware will:
  // 1. Generate or use existing correlation ID from header
  // 2. Attach logger to req.logger
  // 3. Attach correlation ID to req.correlationId
  // 4. Set X-Correlation-ID response header
  // 5. Log request start and completion with timing

  // In your route handlers:
  // req.logger.info('Processing project creation');
  // req.logger.debug('Validating input', { data: req.body });
}

/**
 * Example 9: Service-Level Logging Pattern
 */
class ProjectService {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('ProjectService');
  }

  async createProject(data: any, correlationId?: string) {
    // Create request-scoped logger
    const logger = this.logger.createChildLogger({
      correlationId: correlationId || generateCorrelationId(),
      operation: 'createProject',
    });

    logger.info('Creating new project', { data });

    const endTimer = logger.time('database_insert');
    try {
      // Insert into database
      // const project = await db.insert(data);

      endTimer();
      logger.info('Project created successfully', {
        data: { projectId: '123' },
      });

      return { id: '123' };
    } catch (error) {
      endTimer();
      logger.error('Failed to create project', {
        error,
        data,
      });
      throw error;
    }
  }

  async getProjects(userId: string, correlationId?: string) {
    const logger = this.logger.createChildLogger({
      correlationId: correlationId || generateCorrelationId(),
      operation: 'getProjects',
      userId,
    });

    logger.debug('Fetching projects for user');

    const endTimer = logger.time('database_query');
    try {
      // Query database
      // const projects = await db.query(...);

      endTimer();
      logger.info('Projects fetched successfully', {
        data: { count: 5 },
      });

      return [];
    } catch (error) {
      endTimer();
      logger.error('Failed to fetch projects', { error });
      throw error;
    }
  }
}

/**
 * Example 10: WebSocket Logging Pattern
 */
class WebSocketHandler {
  private logger: Logger;

  constructor() {
    this.logger = wsLogger;
  }

  handleConnection(ws: any, req: any) {
    const connectionId = generateCorrelationId();
    const logger = this.logger.createChildLogger({ connectionId });

    logger.info('WebSocket connection established', {
      data: {
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      },
    });

    ws.on('message', (message: string) => {
      logger.debug('Message received', {
        data: { message: message.substring(0, 100) },
      });
    });

    ws.on('close', () => {
      logger.info('WebSocket connection closed');
    });

    ws.on('error', (error: Error) => {
      logger.error('WebSocket error', { error });
    });
  }
}

/**
 * Example 11: Log Directory Information
 */
function logDirectoryExample() {
  console.log(`Logs are stored in: ${getLogDirectoryPath()}`);
  // Windows: C:\Users\{user}\AppData\Roaming\@dev-suite\dashboard\logs
  // Unix: /home/{user}/.dev-suite/dashboard/logs
  // macOS: /Users/{user}/.dev-suite/dashboard/logs
}

/**
 * Example 12: Production Best Practices
 */
function productionBestPractices() {
  // 1. Always use correlation IDs for request tracing
  const correlationId = generateCorrelationId();
  const logger = createRequestLogger(correlationId);

  // 2. Log appropriate levels (don't spam logs with debug in production)
  // Set LOG_LEVEL=info in production environment

  // 3. Include context data for debugging
  logger.info('Processing payment', {
    data: {
      orderId: '12345',
      amount: 99.99,
      currency: 'USD',
      // Note: sensitive data like card numbers will be redacted
    },
  });

  // 4. Time critical operations
  const endTimer = logger.time('payment_processing');
  try {
    // Process payment
    endTimer();
  } catch (error) {
    endTimer();
    logger.error('Payment failed', { error });
  }

  // 5. Use structured logging for easier parsing
  logger.info('Payment completed', {
    data: {
      orderId: '12345',
      transactionId: 'txn_abc123',
      duration: 450,
    },
  });
}

// Export examples for documentation
export {
  basicLoggingExample,
  loggingWithDataExample,
  errorLoggingExample,
  componentLoggersExample,
  childLoggerExample,
  performanceTimingExample,
  requestScopedLoggingExample,
  expressMiddlewareExample,
  ProjectService,
  WebSocketHandler,
  logDirectoryExample,
  productionBestPractices,
};
