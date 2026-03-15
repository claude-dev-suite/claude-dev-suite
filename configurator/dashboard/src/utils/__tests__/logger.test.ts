// SPDX-License-Identifier: MIT
/**
 * Tests for Enhanced Logger
 *
 * Note: These tests work with the MOCKED logger from setup.ts
 * We test that the logger interface works correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger, apiLogger, wsLogger, uiLogger, getLogger, getSessionId } from '../logger';

describe('Enhanced Logger (mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pre-configured loggers', () => {
    it('should have logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.warn).toBeDefined();
    });

    it('should have apiLogger instance', () => {
      expect(apiLogger).toBeDefined();
      expect(apiLogger.info).toBeDefined();
    });

    it('should have wsLogger instance', () => {
      expect(wsLogger).toBeDefined();
      expect(wsLogger.info).toBeDefined();
    });

    it('should have uiLogger instance', () => {
      expect(uiLogger).toBeDefined();
      expect(uiLogger.info).toBeDefined();
    });
  });

  describe('getLogger factory', () => {
    it('should create custom logger with getLogger', () => {
      const customLogger = getLogger('CustomModule');
      expect(customLogger).toBeDefined();
      expect(customLogger.info).toBeDefined();
      expect(customLogger.error).toBeDefined();
    });

    it('should call getLogger when creating custom loggers', () => {
      getLogger('TestModule');
      expect(getLogger).toHaveBeenCalledWith('TestModule');
    });
  });

  describe('Log methods', () => {
    it('should have callable error method', () => {
      expect(() => logger.error('Error message')).not.toThrow();
    });

    it('should have callable info method', () => {
      expect(() => logger.info('Info message')).not.toThrow();
    });

    it('should have callable debug method', () => {
      expect(() => logger.debug('Debug message')).not.toThrow();
    });

    it('should have callable warn method', () => {
      expect(() => logger.warn('Warn message')).not.toThrow();
    });

    it('should accept data parameter', () => {
      expect(() => logger.info('Message', { key: 'value' })).not.toThrow();
      expect(() => logger.error('Error', new Error('test'))).not.toThrow();
    });
  });

  describe('Context propagation', () => {
    it('should have withContext method', () => {
      expect(logger.withContext).toBeDefined();
      expect(typeof logger.withContext).toBe('function');
    });

    it('should return a logger when calling withContext', () => {
      const contextLogger = logger.withContext({ userId: '123' });
      expect(contextLogger).toBeDefined();
    });
  });

  describe('Performance timing', () => {
    it('should have time method', () => {
      expect(logger.time).toBeDefined();
      expect(typeof logger.time).toBe('function');
    });

    it('should return end timer function', () => {
      const endTimer = logger.time('operation');
      expect(typeof endTimer).toBe('function');
    });
  });

  describe('Session correlation ID', () => {
    it('should return session ID', () => {
      const sessionId = getSessionId();
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
    });
  });
});
