// SPDX-License-Identifier: MIT
/**
 * Unit tests for the orchestrator permission system.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionService } from '../src/services/orchestrator/permission.service.js';

describe('PermissionService', () => {
  let service: PermissionService;

  beforeEach(() => {
    service = new PermissionService();
  });

  // --- classifyOperation ---

  describe('classifyOperation – Bash', () => {
    it('classifies rm -rf as critical', () => {
      const r = service.classifyOperation('Bash', { command: 'rm -rf /tmp/build' });
      expect(r.risk).toBe('critical');
    });

    it('classifies rm -f /home/user as critical', () => {
      const r = service.classifyOperation('Bash', { command: 'rm -f ~/projects' });
      expect(r.risk).toBe('critical');
    });

    it('classifies sudo as high', () => {
      const r = service.classifyOperation('Bash', { command: 'sudo apt update' });
      expect(r.risk).toBe('high');
    });

    it('classifies curl to external URL as high', () => {
      const r = service.classifyOperation('Bash', { command: 'curl https://example.com/data' });
      expect(r.risk).toBe('high');
    });

    it('classifies npm install as medium', () => {
      const r = service.classifyOperation('Bash', { command: 'npm install lodash' });
      expect(r.risk).toBe('medium');
    });

    it('classifies npm install --dry-run as low', () => {
      const r = service.classifyOperation('Bash', { command: 'npm install lodash --dry-run' });
      expect(r.risk).toBe('low');
    });

    it('classifies ls as low', () => {
      const r = service.classifyOperation('Bash', { command: 'ls -la' });
      expect(r.risk).toBe('low');
    });

    it('classifies git push as medium', () => {
      const r = service.classifyOperation('Bash', { command: 'git push origin main' });
      expect(r.risk).toBe('medium');
    });
  });

  describe('classifyOperation – Write', () => {
    it('classifies writing .env as critical', () => {
      const r = service.classifyOperation('Write', { file_path: '/project/.env' });
      expect(r.risk).toBe('critical');
    });

    it('classifies writing .pem file as critical', () => {
      const r = service.classifyOperation('Write', { file_path: '/certs/server.pem' });
      expect(r.risk).toBe('critical');
    });

    it('classifies writing normal TS file as low', () => {
      const r = service.classifyOperation('Write', { file_path: '/project/src/utils.ts' });
      expect(r.risk).toBe('low');
    });
  });

  describe('classifyOperation – Edit', () => {
    it('classifies editing .env as high', () => {
      const r = service.classifyOperation('Edit', { file_path: '/project/.env' });
      expect(r.risk).toBe('high');
    });

    it('classifies editing normal file as low', () => {
      const r = service.classifyOperation('Edit', { file_path: '/project/README.md' });
      expect(r.risk).toBe('low');
    });
  });

  describe('classifyOperation – unknown tool', () => {
    it('returns low risk for Read', () => {
      const r = service.classifyOperation('Read', { file_path: '/project/src/index.ts' });
      expect(r.risk).toBe('low');
    });
  });

  // --- requiresPermission ---

  describe('requiresPermission', () => {
    it('returns true for critical bash command when minRisk is high', () => {
      expect(service.requiresPermission('Bash', { command: 'rm -rf /' }, 'high')).toBe(true);
    });

    it('returns false for low-risk command when minRisk is high', () => {
      expect(service.requiresPermission('Bash', { command: 'ls' }, 'high')).toBe(false);
    });

    it('returns true for medium-risk when minRisk is medium', () => {
      expect(service.requiresPermission('Bash', { command: 'npm install' }, 'medium')).toBe(true);
    });

    it('returns false for low-risk when minRisk is medium', () => {
      expect(service.requiresPermission('Bash', { command: 'echo hello' }, 'medium')).toBe(false);
    });
  });

  // --- createRequest / resolveRequest ---

  describe('createRequest + resolveRequest', () => {
    it('resolves to allow when user allows', async () => {
      const promise = service.createRequest('req-1', 5000);
      const resolved = service.resolveRequest('req-1', 'allow');
      expect(resolved).toBe(true);
      const decision = await promise;
      expect(decision).toBe('allow');
    });

    it('resolves to deny when user denies', async () => {
      const promise = service.createRequest('req-2', 5000);
      service.resolveRequest('req-2', 'deny');
      const decision = await promise;
      expect(decision).toBe('deny');
    });

    it('auto-resolves to allow on timeout', async () => {
      const promise = service.createRequest('req-3', 50); // 50ms timeout
      const decision = await promise;
      expect(decision).toBe('allow');
    }, 1000);

    it('returns false for unknown requestId', () => {
      expect(service.resolveRequest('unknown', 'allow')).toBe(false);
    });
  });

  // --- clearAll ---

  describe('clearAll', () => {
    it('denies all pending requests', async () => {
      const p1 = service.createRequest('r1', 10000);
      const p2 = service.createRequest('r2', 10000);
      service.clearAll();
      const [d1, d2] = await Promise.all([p1, p2]);
      expect(d1).toBe('deny');
      expect(d2).toBe('deny');
    });
  });
});
