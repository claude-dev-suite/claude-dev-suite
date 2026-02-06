import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Replicate schemas from index.ts for testing
const DockerPsSchema = z.object({
  all: z.boolean().optional().default(false),
  filter: z.string().optional(),
});

const DockerContainerSchema = z.object({
  container: z.string().min(1),
  action: z.enum(['start', 'stop', 'restart', 'logs', 'inspect', 'remove']),
  tail: z.number().optional().default(100),
  follow: z.boolean().optional().default(false),
});

const DockerComposeSchema = z.object({
  action: z.enum(['up', 'down', 'restart', 'logs', 'ps', 'build']),
  service: z.string().optional(),
  detach: z.boolean().optional().default(true),
  file: z.string().optional(),
});

describe('Docker Manager Schemas', () => {
  describe('DockerPsSchema', () => {
    it('should validate empty input (defaults)', () => {
      const input = {};

      const result = DockerPsSchema.parse(input);
      expect(result.all).toBe(false);
    });

    it('should accept all flag', () => {
      const input = { all: true };

      const result = DockerPsSchema.parse(input);
      expect(result.all).toBe(true);
    });

    it('should accept filter', () => {
      const input = { filter: 'name=my-container' };

      const result = DockerPsSchema.parse(input);
      expect(result.filter).toBe('name=my-container');
    });
  });

  describe('DockerContainerSchema', () => {
    it('should validate container action', () => {
      const input = {
        container: 'my-app',
        action: 'logs',
      };

      const result = DockerContainerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should default tail to 100', () => {
      const input = {
        container: 'my-app',
        action: 'logs',
      };

      const result = DockerContainerSchema.parse(input);
      expect(result.tail).toBe(100);
    });

    it('should accept custom tail value', () => {
      const input = {
        container: 'my-app',
        action: 'logs',
        tail: 500,
      };

      const result = DockerContainerSchema.parse(input);
      expect(result.tail).toBe(500);
    });

    it('should reject invalid action', () => {
      const input = {
        container: 'my-app',
        action: 'invalid',
      };

      const result = DockerContainerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty container name', () => {
      const input = {
        container: '',
        action: 'start',
      };

      const result = DockerContainerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate all actions', () => {
      const actions = ['start', 'stop', 'restart', 'logs', 'inspect', 'remove'];

      actions.forEach((action) => {
        const input = { container: 'test', action };
        const result = DockerContainerSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('DockerComposeSchema', () => {
    it('should validate compose up', () => {
      const input = {
        action: 'up',
      };

      const result = DockerComposeSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should default detach to true', () => {
      const input = {
        action: 'up',
      };

      const result = DockerComposeSchema.parse(input);
      expect(result.detach).toBe(true);
    });

    it('should accept service filter', () => {
      const input = {
        action: 'logs',
        service: 'backend',
      };

      const result = DockerComposeSchema.parse(input);
      expect(result.service).toBe('backend');
    });

    it('should accept custom compose file', () => {
      const input = {
        action: 'up',
        file: 'docker-compose.prod.yml',
      };

      const result = DockerComposeSchema.parse(input);
      expect(result.file).toBe('docker-compose.prod.yml');
    });

    it('should validate all compose actions', () => {
      const actions = ['up', 'down', 'restart', 'logs', 'ps', 'build'];

      actions.forEach((action) => {
        const input = { action };
        const result = DockerComposeSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });
});
