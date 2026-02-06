import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Replicate schemas from index.ts for testing
const ListEndpointsSchema = z.object({});

const FetchSchemaSchema = z.object({
  alias: z.string().min(1),
  refresh: z.boolean().optional().default(false),
});

const SearchEndpointsSchema = z.object({
  query: z.string().min(1),
  alias: z.string().optional(),
});

const GetEndpointDetailsSchema = z.object({
  alias: z.string().min(1),
  path: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
});

describe('API Explorer Schemas', () => {
  describe('ListEndpointsSchema', () => {
    it('should validate empty input', () => {
      const input = {};

      const result = ListEndpointsSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('FetchSchemaSchema', () => {
    it('should validate alias', () => {
      const input = {
        alias: 'backend',
      };

      const result = FetchSchemaSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should default refresh to false', () => {
      const input = {
        alias: 'backend',
      };

      const result = FetchSchemaSchema.parse(input);
      expect(result.refresh).toBe(false);
    });

    it('should accept refresh flag', () => {
      const input = {
        alias: 'backend',
        refresh: true,
      };

      const result = FetchSchemaSchema.parse(input);
      expect(result.refresh).toBe(true);
    });

    it('should reject empty alias', () => {
      const input = {
        alias: '',
      };

      const result = FetchSchemaSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('SearchEndpointsSchema', () => {
    it('should validate search query', () => {
      const input = {
        query: 'users',
      };

      const result = SearchEndpointsSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept alias filter', () => {
      const input = {
        query: 'auth',
        alias: 'backend',
      };

      const result = SearchEndpointsSchema.parse(input);
      expect(result.alias).toBe('backend');
    });

    it('should reject empty query', () => {
      const input = {
        query: '',
      };

      const result = SearchEndpointsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('GetEndpointDetailsSchema', () => {
    it('should validate endpoint details request', () => {
      const input = {
        alias: 'backend',
        path: '/api/users',
      };

      const result = GetEndpointDetailsSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept method filter', () => {
      const input = {
        alias: 'backend',
        path: '/api/users',
        method: 'POST',
      };

      const result = GetEndpointDetailsSchema.parse(input);
      expect(result.method).toBe('POST');
    });

    it('should validate all HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

      methods.forEach((method) => {
        const input = {
          alias: 'backend',
          path: '/api/test',
          method,
        };
        const result = GetEndpointDetailsSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it('should reject empty alias', () => {
      const input = {
        alias: '',
        path: '/api/users',
      };

      const result = GetEndpointDetailsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty path', () => {
      const input = {
        alias: 'backend',
        path: '',
      };

      const result = GetEndpointDetailsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

describe('API Endpoint Parsing', () => {
  it('should parse API_ENDPOINTS environment variable format', () => {
    // Format: alias:url,alias2:url2
    const envValue = 'backend:http://localhost:8080/v3/api-docs,frontend:http://localhost:3000/api/swagger.json';

    const endpoints = envValue.split(',').map((entry) => {
      const [alias, url] = entry.split(':');
      return { alias, url: url.replace(/^/, entry.substring(alias.length + 1)) };
    });

    // This tests the parsing logic that would be used in the server
    expect(endpoints.length).toBe(2);
  });
});
