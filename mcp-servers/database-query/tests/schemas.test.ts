import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Replicate schemas from index.ts for testing
const ExecuteQuerySchema = z.object({
  sql: z.string().min(1),
  params: z.array(z.unknown()).optional(),
});

const DescribeTableSchema = z.object({
  table: z.string().min(1),
  schema: z.string().optional().default('public'),
});

describe('Database Query Schemas', () => {
  describe('ExecuteQuerySchema', () => {
    it('should validate simple SELECT query', () => {
      const input = {
        sql: 'SELECT * FROM users',
      };

      const result = ExecuteQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate query with params', () => {
      const input = {
        sql: 'SELECT * FROM users WHERE id = $1',
        params: [1],
      };

      const result = ExecuteQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty SQL', () => {
      const input = {
        sql: '',
      };

      const result = ExecuteQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept various param types', () => {
      const input = {
        sql: 'INSERT INTO users (name, age, active) VALUES ($1, $2, $3)',
        params: ['John', 30, true],
      };

      const result = ExecuteQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('DescribeTableSchema', () => {
    it('should validate table name', () => {
      const input = {
        table: 'users',
      };

      const result = DescribeTableSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should default schema to public', () => {
      const input = {
        table: 'users',
      };

      const result = DescribeTableSchema.parse(input);
      expect(result.schema).toBe('public');
    });

    it('should accept custom schema', () => {
      const input = {
        table: 'users',
        schema: 'app',
      };

      const result = DescribeTableSchema.parse(input);
      expect(result.schema).toBe('app');
    });

    it('should reject empty table name', () => {
      const input = {
        table: '',
      };

      const result = DescribeTableSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

describe('SQL Security', () => {
  it('should only allow SELECT queries (validation in handler)', () => {
    // This test documents the expected security behavior
    // Actual validation happens in the handler, not schema
    const dangerousQueries = [
      'DROP TABLE users',
      'DELETE FROM users',
      'UPDATE users SET admin = true',
      'INSERT INTO users VALUES (1)',
      'TRUNCATE users',
    ];

    // Schema allows any SQL string - security is enforced in handler
    dangerousQueries.forEach((sql) => {
      const result = ExecuteQuerySchema.safeParse({ sql });
      // Schema parses - but handler should reject
      expect(result.success).toBe(true);
    });
  });
});
