import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv, requireEnv, patterns, schemas } from '../env-validator.js';

describe('env-validator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateEnv', () => {
    it('should pass with valid required env vars', () => {
      process.env.TEST_VAR = 'value';

      const result = validateEnv({
        TEST_VAR: { required: true },
      });

      expect(result.success).toBe(true);
      expect(result.data?.TEST_VAR).toBe('value');
    });

    it('should fail with missing required env vars', () => {
      delete process.env.MISSING_VAR;

      const result = validateEnv({
        MISSING_VAR: { required: true },
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        'Missing required environment variable: MISSING_VAR'
      );
    });

    it('should use default values', () => {
      delete process.env.OPTIONAL_VAR;

      const result = validateEnv({
        OPTIONAL_VAR: { required: false, default: 'default-value' },
      });

      expect(result.success).toBe(true);
      expect(result.data?.OPTIONAL_VAR).toBe('default-value');
    });

    it('should validate patterns', () => {
      process.env.URL_VAR = 'not-a-url';

      const result = validateEnv({
        URL_VAR: { required: true, pattern: /^https?:\/\// },
      });

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Invalid format');
    });

    it('should pass valid patterns', () => {
      process.env.URL_VAR = 'https://example.com';

      const result = validateEnv({
        URL_VAR: { required: true, pattern: /^https?:\/\// },
      });

      expect(result.success).toBe(true);
    });

    it('should transform values', () => {
      process.env.PORT = '3000';

      const result = validateEnv({
        PORT: { required: true, transform: parseInt },
      });

      expect(result.success).toBe(true);
      expect(result.data?.PORT).toBe(3000);
    });

    it('should run custom validators', () => {
      process.env.CUSTOM = 'invalid';

      const result = validateEnv({
        CUSTOM: {
          required: true,
          validate: (v) => v === 'valid' || 'Must be "valid"',
        },
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Must be "valid"');
    });

    it('should include description in error messages', () => {
      delete process.env.DESCRIBED_VAR;

      const result = validateEnv({
        DESCRIBED_VAR: {
          required: true,
          description: 'Important configuration value',
        },
      });

      expect(result.errors?.[0]).toContain('Important configuration value');
    });
  });

  describe('requireEnv', () => {
    it('should return data on success', () => {
      process.env.REQUIRED = 'value';

      const data = requireEnv({ REQUIRED: { required: true } }, 'test-server');

      expect(data.REQUIRED).toBe('value');
    });

    it('should throw on failure', () => {
      delete process.env.REQUIRED;

      expect(() =>
        requireEnv({ REQUIRED: { required: true } }, 'test-server')
      ).toThrow('Environment validation failed for test-server');
    });
  });

  describe('patterns', () => {
    it('should validate URLs', () => {
      expect(patterns.url.test('https://example.com')).toBe(true);
      expect(patterns.url.test('http://localhost:3000')).toBe(true);
      expect(patterns.url.test('not-a-url')).toBe(false);
    });

    it('should validate PostgreSQL URLs', () => {
      expect(
        patterns.postgresUrl.test('postgresql://user:pass@localhost/db')
      ).toBe(true);
      expect(patterns.postgresUrl.test('postgres://user:pass@localhost/db')).toBe(
        true
      );
      expect(patterns.postgresUrl.test('mysql://user:pass@localhost/db')).toBe(
        false
      );
    });

    it('should validate GitHub tokens', () => {
      expect(patterns.githubToken.test('ghp_1234567890abcdefghijklmnopqrstuvwxyz')).toBe(true);
      expect(patterns.githubToken.test('ghs_1234567890abcdefghijklmnopqrstuvwxyz')).toBe(true);
      expect(patterns.githubToken.test('invalid')).toBe(false);
    });
  });

  describe('schemas', () => {
    describe('documentation schema', () => {
      it('should validate KB_MODE', () => {
        process.env.KB_MODE = 'git';

        const result = validateEnv({
          KB_MODE: schemas.documentation.KB_MODE,
        });

        expect(result.success).toBe(true);
      });

      it('should reject invalid KB_MODE', () => {
        process.env.KB_MODE = 'invalid';

        const result = validateEnv({
          KB_MODE: schemas.documentation.KB_MODE,
        });

        expect(result.success).toBe(false);
      });
    });

    describe('gitManager schema', () => {
      it('should validate GIT_PROVIDER', () => {
        process.env.GIT_PROVIDER = 'github';

        const result = validateEnv({
          GIT_PROVIDER: schemas.gitManager.GIT_PROVIDER,
        });

        expect(result.success).toBe(true);
      });

      it('should reject invalid GIT_PROVIDER', () => {
        process.env.GIT_PROVIDER = 'invalid-provider';

        const result = validateEnv({
          GIT_PROVIDER: schemas.gitManager.GIT_PROVIDER,
        });

        expect(result.success).toBe(false);
      });
    });
  });
});
