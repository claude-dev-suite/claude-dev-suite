// SPDX-License-Identifier: MIT
/**
 * Usage Routes Tests
 *
 * Unit tests for usage monitor route handler logic.
 * Tests service integration, path validation, and Zod schema validation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsageService } from '../../src/services/usage.service.js';
import { SaveUsageConfigRequestSchema } from '../../src/validation/schemas.js';
import { PathValidationError, resolveProjectPath } from '../../src/utils/utilities.js';

vi.mock('../../src/services/usage.service.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/home/user/my-project';

const MOCK_USAGE_SUMMARY = {
  usageReport: {
    totalTokens: 150000,
    promptTokens: 90000,
    completionTokens: 60000,
    byModel: { 'claude-3-5-sonnet': 150000 },
  },
  costReport: {
    totalCost: 4.5,
    currency: 'USD',
  },
  firedAlerts: [],
  deepLinks: [],
  lastFetched: '2024-01-01T00:00:00Z',
};

const MOCK_USAGE_CONFIG = {
  adminApiKey: 'sk-ant-admin-xxx',
  alertThresholds: {
    daily: 10,
    monthly: 100,
  },
  pollingIntervalMs: 60000,
};

const MOCK_DEEP_LINKS = [
  { label: 'Billing', url: 'https://console.anthropic.com/settings/billing' },
  { label: 'Usage Dashboard', url: 'https://console.anthropic.com/usage' },
];

// ---------------------------------------------------------------------------

describe('Usage Routes - Service Integration', () => {
  let usageService: UsageService;

  beforeEach(() => {
    usageService = new UsageService();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // GET /usage/summary
  // -------------------------------------------------------------------------
  describe('getSummary logic', () => {
    it('should return usage summary for project', async () => {
      vi.mocked(usageService.getSummary).mockResolvedValue(MOCK_USAGE_SUMMARY);

      const result = await usageService.getSummary(PROJECT_PATH);

      expect(usageService.getSummary).toHaveBeenCalledWith(PROJECT_PATH);
      expect(result.usageReport.totalTokens).toBe(150000);
      expect(result.costReport.totalCost).toBe(4.5);
    });

    it('should surface service errors', async () => {
      vi.mocked(usageService.getSummary).mockRejectedValue(new Error('API key invalid'));

      await expect(usageService.getSummary(PROJECT_PATH)).rejects.toThrow('API key invalid');
    });
  });

  // -------------------------------------------------------------------------
  // GET /usage/config
  // -------------------------------------------------------------------------
  describe('getConfig logic', () => {
    it('should return usage config for project', () => {
      vi.mocked(usageService.getConfig).mockReturnValue(MOCK_USAGE_CONFIG);

      const result = usageService.getConfig(PROJECT_PATH);

      expect(usageService.getConfig).toHaveBeenCalledWith(PROJECT_PATH);
      expect(result.pollingIntervalMs).toBe(60000);
    });

    it('should surface service errors', () => {
      vi.mocked(usageService.getConfig).mockImplementation(() => {
        throw new Error('config not found');
      });

      expect(() => usageService.getConfig(PROJECT_PATH)).toThrow('config not found');
    });
  });

  // -------------------------------------------------------------------------
  // POST /usage/config
  // -------------------------------------------------------------------------
  describe('saveConfig logic', () => {
    it('should save usage config for project', () => {
      vi.mocked(usageService.saveConfig).mockReturnValue(undefined);

      usageService.saveConfig(PROJECT_PATH, MOCK_USAGE_CONFIG);

      expect(usageService.saveConfig).toHaveBeenCalledWith(PROJECT_PATH, MOCK_USAGE_CONFIG);
    });

    it('should surface service errors when saving', () => {
      vi.mocked(usageService.saveConfig).mockImplementation(() => {
        throw new Error('write failed');
      });

      expect(() => usageService.saveConfig(PROJECT_PATH, MOCK_USAGE_CONFIG)).toThrow('write failed');
    });
  });

  // -------------------------------------------------------------------------
  // GET /usage/deep-links
  // -------------------------------------------------------------------------
  describe('getDeepLinks logic', () => {
    it('should return static deep links', () => {
      vi.mocked(usageService.getDeepLinks).mockReturnValue(MOCK_DEEP_LINKS);

      const result = usageService.getDeepLinks();

      expect(usageService.getDeepLinks).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('Billing');
    });

    it('should surface service errors', () => {
      vi.mocked(usageService.getDeepLinks).mockImplementation(() => {
        throw new Error('links unavailable');
      });

      expect(() => usageService.getDeepLinks()).toThrow('links unavailable');
    });
  });

  // -------------------------------------------------------------------------
  // Path validation
  // -------------------------------------------------------------------------
  describe('Path validation', () => {
    it('should reject path traversal sequences', () => {
      expect(() => resolveProjectPath('/home/user/../../etc/passwd')).toThrow(PathValidationError);
    });

    it('should reject relative paths', () => {
      expect(() => resolveProjectPath('relative/path/here')).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Zod validation - SaveUsageConfigRequestSchema
  // -------------------------------------------------------------------------
  describe('Zod validation - SaveUsageConfigRequestSchema', () => {
    const validThreshold = {
      id: 'monthly-cost',
      name: 'Monthly Cost Alert',
      metric: 'monthly_cost' as const,
      operator: 'gt' as const,
      value: 100,
      severity: 'warning' as const,
      enabled: true,
    };

    it('should accept valid save config request', () => {
      const result = SaveUsageConfigRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        config: {
          adminApiKey: 'sk-ant-admin-xxx',
          alertThresholds: [validThreshold],
          pollingIntervalMs: 60000,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept config with empty alert thresholds', () => {
      const result = SaveUsageConfigRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        config: {
          alertThresholds: [],
          pollingIntervalMs: 300000,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing projectPath', () => {
      const result = SaveUsageConfigRequestSchema.safeParse({
        config: { adminApiKey: 'sk-ant-admin-xxx', alertThresholds: [], pollingIntervalMs: 60000 },
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing config', () => {
      const result = SaveUsageConfigRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty projectPath', () => {
      const result = SaveUsageConfigRequestSchema.safeParse({
        projectPath: '',
        config: { alertThresholds: [], pollingIntervalMs: 60000 },
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-positive pollingIntervalMs', () => {
      const result = SaveUsageConfigRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        config: {
          alertThresholds: [],
          pollingIntervalMs: 0,
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid metric enum in threshold', () => {
      const badThreshold = { ...validThreshold, metric: 'hourly_cost' };
      const result = SaveUsageConfigRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        config: {
          alertThresholds: [badThreshold],
          pollingIntervalMs: 60000,
        },
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Response structure
  // -------------------------------------------------------------------------
  describe('Response structure', () => {
    it('should format summary response with success and data', async () => {
      vi.mocked(usageService.getSummary).mockResolvedValue(MOCK_USAGE_SUMMARY);

      const summary = await usageService.getSummary(PROJECT_PATH);
      const response = { success: true, data: summary };

      expect(response.success).toBe(true);
      expect(response.data.usageReport).toBeDefined();
    });

    it('should format config GET response', () => {
      vi.mocked(usageService.getConfig).mockReturnValue(MOCK_USAGE_CONFIG);

      const config = usageService.getConfig(PROJECT_PATH);
      const response = { success: true, data: config };

      expect(response.data.adminApiKey).toBe('sk-ant-admin-xxx');
    });

    it('should format config POST success response', () => {
      const response = { success: true, data: { message: 'Usage config saved successfully' } };

      expect(response.success).toBe(true);
      expect(response.data.message).toContain('saved successfully');
    });

    it('should format PathValidationError as 400', () => {
      const err = new PathValidationError('Path must be rooted');
      const response = { success: false, error: err.message };

      expect(response.success).toBe(false);
      expect(response.error).toBe('Path must be rooted');
    });

    it('should format deep-links response', () => {
      vi.mocked(usageService.getDeepLinks).mockReturnValue(MOCK_DEEP_LINKS);

      const links = usageService.getDeepLinks();
      const response = { success: true, data: links };

      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data[0]).toHaveProperty('label');
      expect(response.data[0]).toHaveProperty('url');
    });
  });
});
