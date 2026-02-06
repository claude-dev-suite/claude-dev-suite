/**
 * Logger Tests
 *
 * Tests for the comprehensive logging service.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  serverLogger,
  wsLogger,
  apiLogger,
  serviceLogger,
  getLogger,
  generateCorrelationId,
  createRequestLogger,
  getLogDirectoryPath,
  type Logger,
} from '../src/utils/logger.js';

describe('Logger', () => {
  describe('Pre-configured Loggers', () => {
    it('should have component set for serverLogger', () => {
      expect(serverLogger.defaultMeta).toHaveProperty('component', 'Server');
    });

    it('should have component set for wsLogger', () => {
      expect(wsLogger.defaultMeta).toHaveProperty('component', 'WebSocket');
    });

    it('should have component set for apiLogger', () => {
      expect(apiLogger.defaultMeta).toHaveProperty('component', 'API');
    });

    it('should have component set for serviceLogger', () => {
      expect(serviceLogger.defaultMeta).toHaveProperty('component', 'Service');
    });
  });

  describe('Custom Logger', () => {
    it('should create logger with custom name', () => {
      const logger = getLogger('TestComponent');
      expect(logger.defaultMeta).toHaveProperty('component', 'TestComponent');
    });

    it('should create logger with additional context', () => {
      const logger = getLogger('TestComponent', {
        userId: '12345',
        environment: 'test',
      });

      expect(logger.defaultMeta).toHaveProperty('component', 'TestComponent');
      expect(logger.defaultMeta).toHaveProperty('userId', '12345');
      expect(logger.defaultMeta).toHaveProperty('environment', 'test');
    });
  });

  describe('Child Logger', () => {
    it('should create child logger with inherited context', () => {
      const parentLogger = getLogger('Parent', {
        userId: '12345',
      });

      const childLogger = parentLogger.createChildLogger({
        operation: 'test',
      });

      expect(childLogger.defaultMeta).toHaveProperty('component', 'Parent');
      expect(childLogger.defaultMeta).toHaveProperty('userId', '12345');
      expect(childLogger.defaultMeta).toHaveProperty('operation', 'test');
    });
  });

  describe('Correlation ID', () => {
    it('should generate valid UUID v4', () => {
      const correlationId = generateCorrelationId();
      expect(correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should create request logger with correlation ID', () => {
      const correlationId = generateCorrelationId();
      const logger = createRequestLogger(correlationId);

      expect(logger.defaultMeta).toHaveProperty('component', 'Request');
      expect(logger.defaultMeta).toHaveProperty('correlationId', correlationId);
    });

    it('should create request logger with auto-generated correlation ID', () => {
      const logger = createRequestLogger();

      expect(logger.defaultMeta).toHaveProperty('component', 'Request');
      expect(logger.defaultMeta).toHaveProperty('correlationId');
      expect(logger.defaultMeta.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('Performance Timing', () => {
    it('should provide time function', () => {
      const logger = getLogger('Test');
      const endTimer = logger.time('test_operation');

      expect(typeof endTimer).toBe('function');

      // Call end timer
      endTimer();
    });

    it('should log timing information', () => {
      const logger = getLogger('Test');

      // Mock the debug method to capture calls
      const debugSpy = vi.spyOn(logger, 'debug');

      const endTimer = logger.time('test_operation');
      endTimer();

      // Should have 2 calls: start and end
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(1, 'Starting: test_operation', expect.any(Object));
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        'Completed: test_operation',
        expect.objectContaining({
          duration: expect.any(Number),
        })
      );
    });
  });

  describe('Log Directory', () => {
    it('should return valid log directory path', () => {
      const logDir = getLogDirectoryPath();

      expect(logDir).toBeTruthy();
      expect(typeof logDir).toBe('string');

      // Should contain platform-specific path
      if (process.platform === 'win32') {
        expect(logDir).toContain('@dev-suite');
        expect(logDir).toContain('dashboard');
        expect(logDir).toContain('logs');
      } else {
        expect(logDir).toContain('.dev-suite');
        expect(logDir).toContain('dashboard');
        expect(logDir).toContain('logs');
      }
    });
  });

  describe('Logging Methods', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = getLogger('Test');
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
      logger.error('Test error');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
      logger.warn('Test warning');
    });

    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
      logger.info('Test info');
    });

    it('should have http method', () => {
      expect(typeof logger.http).toBe('function');
      logger.http('Test http');
    });

    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
      logger.debug('Test debug');
    });
  });

  describe('Backward Compatibility', () => {
    it('should export logger as serverLogger alias', async () => {
      const { logger, serverLogger: server } = await import('../src/utils/logger.js');
      expect(logger).toBe(server);
    });

    it('should export httpLogger as apiLogger alias', async () => {
      const { httpLogger, apiLogger: api } = await import('../src/utils/logger.js');
      expect(httpLogger).toBe(api);
    });

    it('should export log object with convenience methods', async () => {
      const { log } = await import('../src/utils/logger.js');

      expect(typeof log.error).toBe('function');
      expect(typeof log.warn).toBe('function');
      expect(typeof log.info).toBe('function');
      expect(typeof log.debug).toBe('function');
      expect(typeof log.http).toBe('function');
    });
  });
});
