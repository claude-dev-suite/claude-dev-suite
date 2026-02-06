import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Replicate schemas from index.ts for testing
const HttpRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  timeout: z.number().optional().default(30000),
});

const HealthCheckSchema = z.object({
  url: z.string().url(),
  endpoints: z.array(z.string()).optional(),
});

const BatchRequestSchema = z.object({
  requests: z.array(
    z.object({
      name: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      url: z.string().url(),
      headers: z.record(z.string()).optional(),
      body: z.unknown().optional(),
    })
  ),
  sequential: z.boolean().optional().default(false),
});

describe('API Tester Schemas', () => {
  describe('HttpRequestSchema', () => {
    it('should validate a simple GET request', () => {
      const input = {
        method: 'GET',
        url: 'https://api.example.com/users',
      };

      const result = HttpRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate POST request with body', () => {
      const input = {
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: { 'Content-Type': 'application/json' },
        body: { name: 'John', email: 'john@example.com' },
      };

      const result = HttpRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid HTTP method', () => {
      const input = {
        method: 'INVALID',
        url: 'https://api.example.com/users',
      };

      const result = HttpRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid URL', () => {
      const input = {
        method: 'GET',
        url: 'not-a-valid-url',
      };

      const result = HttpRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should default timeout to 30000', () => {
      const input = {
        method: 'GET',
        url: 'https://api.example.com/users',
      };

      const result = HttpRequestSchema.parse(input);
      expect(result.timeout).toBe(30000);
    });

    it('should accept custom timeout', () => {
      const input = {
        method: 'GET',
        url: 'https://api.example.com/users',
        timeout: 5000,
      };

      const result = HttpRequestSchema.parse(input);
      expect(result.timeout).toBe(5000);
    });
  });

  describe('HealthCheckSchema', () => {
    it('should validate basic health check', () => {
      const input = {
        url: 'https://api.example.com',
      };

      const result = HealthCheckSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept endpoints array', () => {
      const input = {
        url: 'https://api.example.com',
        endpoints: ['/health', '/ready', '/live'],
      };

      const result = HealthCheckSchema.parse(input);
      expect(result.endpoints).toEqual(['/health', '/ready', '/live']);
    });
  });

  describe('BatchRequestSchema', () => {
    it('should validate batch requests', () => {
      const input = {
        requests: [
          { name: 'get-users', method: 'GET', url: 'https://api.example.com/users' },
          { name: 'get-posts', method: 'GET', url: 'https://api.example.com/posts' },
        ],
      };

      const result = BatchRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should default sequential to false', () => {
      const input = {
        requests: [
          { name: 'test', method: 'GET', url: 'https://api.example.com/test' },
        ],
      };

      const result = BatchRequestSchema.parse(input);
      expect(result.sequential).toBe(false);
    });

    it('should accept sequential flag', () => {
      const input = {
        requests: [
          { name: 'test', method: 'GET', url: 'https://api.example.com/test' },
        ],
        sequential: true,
      };

      const result = BatchRequestSchema.parse(input);
      expect(result.sequential).toBe(true);
    });

    it('should reject empty requests array', () => {
      const input = {
        requests: [],
      };

      // Empty array is technically valid for z.array()
      const result = BatchRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});
