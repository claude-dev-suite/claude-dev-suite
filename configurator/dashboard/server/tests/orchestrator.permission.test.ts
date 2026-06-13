// SPDX-License-Identifier: MIT
/**
 * Comprehensive unit tests for the orchestrator permission system.
 *
 * Covers:
 *  A. classifyOperation — exhaustive Bash / Write / Edit / unknown patterns
 *  B. category and description fields
 *  C. requiresPermission — all minRisk thresholds
 *  D. Request lifecycle (hasPending, createRequest, resolveRequest)
 *  E. Concurrent requests and clearAll behaviour
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionService } from '../src/services/orchestrator/permission.service.js';
import type { RiskLevel } from '../src/services/orchestrator/permission.service.js';

describe('PermissionService', () => {
  let service: PermissionService;

  beforeEach(() => {
    service = new PermissionService();
  });

  afterEach(() => {
    // Clear any pending requests so timers don't leak
    service.clearAll();
  });

  // ─── A. classifyOperation – Bash ──────────────────────────────────────────

  describe('A. classifyOperation – Bash critical patterns', () => {
    const criticalCmds = [
      'rm -rf /tmp',
      'rm -rf ~/project',
      'rm --recursive /',
      'rm --recursive /home',
      'rmdir /tmp/dir',
      'shred -u file.txt',
      'shred -u secrets.txt',
      'wipe /dev/sda',
      'dd if=/dev/zero of=/dev/sda',
      'dd if=/dev/urandom of=/tmp/fill bs=1M count=100',
      'mkfs.ext4 /dev/sdb1',
      'mkfs -t ext4 /dev/sdb',
      'format C:',
      'deltree C:\\Windows',
      // Simple rm targeting absolute or home paths is also critical
      'rm /tmp/file',
      'rm -f ~/projects',
      'rm --force /var/log/app.log',
    ];

    for (const cmd of criticalCmds) {
      it(`classifies "${cmd.slice(0, 50)}" as critical`, () => {
        const r = service.classifyOperation('Bash', { command: cmd });
        expect(r.risk).toBe('critical');
      });
    }
  });

  describe('A. classifyOperation – Bash: sudo rm with absolute path is critical (not high)', () => {
    it('sudo rm /var/log/syslog is critical because rm + absolute path matches CRITICAL_BASH', () => {
      const r = service.classifyOperation('Bash', { command: 'sudo rm /var/log/syslog' });
      expect(r.risk).toBe('critical');
    });
  });

  describe('A. classifyOperation – Bash high patterns', () => {
    const highCmds = [
      'sudo apt update',
      'su -l root',
      'su mario',
      'chmod 777 /tmp/file',
      'chmod 0777 /etc/passwd',
      'chown root:root /etc/nginx/nginx.conf',
      'curl https://example.com',
      'curl -O https://example.com/install.sh',
      'wget https://example.com/file.sh',
      'nc localhost 4444',
      'ncat -l 8080',
      'netcat 192.168.1.1 22',
      'echo hello | nc 127.0.0.1 5000',
    ];

    for (const cmd of highCmds) {
      it(`classifies "${cmd.slice(0, 60)}" as high`, () => {
        const r = service.classifyOperation('Bash', { command: cmd });
        expect(r.risk).toBe('high');
      });
    }
  });

  describe('A. classifyOperation – Bash medium patterns', () => {
    const mediumCmds = [
      'npm install',
      'npm install lodash',
      'npm install --save-dev typescript',
      'pip install requests',
      'pip install -r requirements.txt',
      'apt install nginx',
      'apt-get install vim',
      'brew install jq',
      'git push origin main',
      'git reset --hard HEAD~1',
      'git clean -f',
    ];

    for (const cmd of mediumCmds) {
      it(`classifies "${cmd}" as medium`, () => {
        const r = service.classifyOperation('Bash', { command: cmd });
        expect(r.risk).toBe('medium');
      });
    }
  });

  describe('A. classifyOperation – Bash dry-run excluded from medium', () => {
    it('classifies npm install --dry-run as low', () => {
      const r = service.classifyOperation('Bash', { command: 'npm install lodash --dry-run' });
      expect(r.risk).toBe('low');
    });

    it('classifies pip install --dry-run as low', () => {
      const r = service.classifyOperation('Bash', { command: 'pip install -r requirements.txt --dry-run' });
      expect(r.risk).toBe('low');
    });
  });

  describe('A. classifyOperation – Bash low / safe patterns', () => {
    const lowCmds = [
      'ls -la',
      'echo "hello"',
      'cat file.txt',
      'pwd',
      'git status',
      'git log --oneline',
      'npm test',
      'node index.js',
      'grep -r pattern src/',
      'mkdir -p /tmp/build',
    ];

    for (const cmd of lowCmds) {
      it(`classifies "${cmd}" as low`, () => {
        const r = service.classifyOperation('Bash', { command: cmd });
        expect(r.risk).toBe('low');
      });
    }
  });

  // ─── A. classifyOperation – Write ─────────────────────────────────────────

  describe('A. classifyOperation – Write critical (sensitive paths)', () => {
    const criticalPaths: Array<{ key: string; path: string }> = [
      { key: 'file_path', path: '/project/.env' },
      // .env.local ends with .local, not .env, so it does NOT match SENSITIVE_FILE.
      // That edge-case is documented below in the low-paths list.
      { key: 'file_path', path: '/project/server.key' },
      { key: 'file_path', path: '/certs/server.pem' },
      { key: 'file_path', path: '/certs/server.p12' },
      { key: 'file_path', path: '/certs/server.pfx' },
      { key: 'file_path', path: '/app/app.jks' },
      { key: 'file_path', path: '/app/db.secrets' },
      { key: 'file_path', path: '/app/db.secret' },
      { key: 'file_path', path: '/app/db.credentials' },
      { key: 'file_path', path: '/app/db.credential' },
      { key: 'file_path', path: '/app/.password' },
      { key: 'file_path', path: '/app/auth.token' },
      { key: 'file_path', path: '/project/private.key' },
      { key: 'file_path', path: '/etc/nginx/nginx.conf' },
      { key: 'file_path', path: 'C:/Users/mario/.ssh/id_rsa' },
      { key: 'file_path', path: '/home/user/.config/settings.json' },
      { key: 'file_path', path: '/home/user/.aws/credentials' },
      { key: 'file_path', path: '/home/user/.kube/config' },
      // Using the 'path' key instead of 'file_path'
      { key: 'path', path: '/project/.env' },
    ];

    for (const { key, path } of criticalPaths) {
      it(`classifies Write to ${path} (key: ${key}) as critical`, () => {
        const r = service.classifyOperation('Write', { [key]: path });
        expect(r.risk).toBe('critical');
      });
    }
  });

  describe('A. classifyOperation – Write low (safe paths)', () => {
    const safePaths = [
      '/project/src/utils.ts',
      '/project/README.md',
      '/project/package.json',
      '/project/src/components/Button.tsx',
      // .env.local ends with .local, not .env, so SENSITIVE_FILE does NOT match
      '/project/.env.local',
    ];

    for (const filePath of safePaths) {
      it(`classifies Write to ${filePath} as low`, () => {
        const r = service.classifyOperation('Write', { file_path: filePath });
        expect(r.risk).toBe('low');
      });
    }
  });

  // ─── A. classifyOperation – Edit ──────────────────────────────────────────

  describe('A. classifyOperation – Edit high (sensitive paths)', () => {
    const highPaths = [
      '/project/.env',
      '/project/server.key',
      '~/.ssh/authorized_keys',
    ];

    for (const filePath of highPaths) {
      it(`classifies Edit to ${filePath} as high`, () => {
        const r = service.classifyOperation('Edit', { file_path: filePath });
        expect(r.risk).toBe('high');
      });
    }
  });

  describe('A. classifyOperation – Edit low (safe paths)', () => {
    it('classifies editing a normal TS file as low', () => {
      const r = service.classifyOperation('Edit', { file_path: '/project/src/utils.ts' });
      expect(r.risk).toBe('low');
    });

    it('classifies editing package.json as low', () => {
      const r = service.classifyOperation('Edit', { file_path: '/project/package.json' });
      expect(r.risk).toBe('low');
    });
  });

  // ─── A. classifyOperation – Other tools ───────────────────────────────────

  describe('A. classifyOperation – other tools always low', () => {
    const otherTools = ['Read', 'Glob', 'Grep', 'WebFetch', 'Task'];

    for (const tool of otherTools) {
      it(`classifies ${tool} tool as low`, () => {
        const r = service.classifyOperation(tool, { file_path: '/project/src/index.ts' });
        expect(r.risk).toBe('low');
      });
    }
  });

  // ─── B. category and description fields ───────────────────────────────────

  describe('B. category and description fields', () => {
    it('critical Bash has category "Destructive shell command"', () => {
      const r = service.classifyOperation('Bash', { command: 'rm -rf /tmp/build' });
      expect(r.category).toBe('Destructive shell command');
    });

    it('high Bash has category "Privileged / network shell command"', () => {
      const r = service.classifyOperation('Bash', { command: 'sudo apt update' });
      expect(r.category).toBe('Privileged / network shell command');
    });

    it('medium Bash has category "Package installation"', () => {
      const r = service.classifyOperation('Bash', { command: 'npm install lodash' });
      expect(r.category).toBe('Package installation');
    });

    it('low Bash has category "Shell command"', () => {
      const r = service.classifyOperation('Bash', { command: 'ls -la' });
      expect(r.category).toBe('Shell command');
    });

    it('critical Write has category "Sensitive file write"', () => {
      const r = service.classifyOperation('Write', { file_path: '/project/.env' });
      expect(r.category).toBe('Sensitive file write');
    });

    it('low Write has category "File write"', () => {
      const r = service.classifyOperation('Write', { file_path: '/project/src/utils.ts' });
      expect(r.category).toBe('File write');
    });

    it('high Edit has category "Sensitive file edit"', () => {
      const r = service.classifyOperation('Edit', { file_path: '/project/.env' });
      expect(r.category).toBe('Sensitive file edit');
    });

    it('low Edit has category "File edit"', () => {
      const r = service.classifyOperation('Edit', { file_path: '/project/src/utils.ts' });
      expect(r.category).toBe('File edit');
    });

    it('unknown tool category equals the tool name', () => {
      const r = service.classifyOperation('Read', { file_path: '/project/src/index.ts' });
      expect(r.category).toBe('Read');
    });

    it('Bash description contains the command and is ≤ 120 chars', () => {
      const cmd = 'rm -rf /tmp/build';
      const r = service.classifyOperation('Bash', { command: cmd });
      expect(r.description).toContain(cmd);
      expect(r.description.length).toBeLessThanOrEqual(120);
    });

    it('Bash description truncates at 120 chars for very long commands', () => {
      const cmd = 'ls ' + 'a'.repeat(200);
      const r = service.classifyOperation('Bash', { command: cmd });
      expect(r.description.length).toBeLessThanOrEqual(120);
    });

    it('Write description is the file path', () => {
      const filePath = '/project/src/utils.ts';
      const r = service.classifyOperation('Write', { file_path: filePath });
      expect(r.description).toBe(filePath);
    });

    it('description is a non-empty string', () => {
      const r = service.classifyOperation('Bash', { command: 'echo hi' });
      expect(typeof r.description).toBe('string');
      expect(r.description.length).toBeGreaterThan(0);
    });
  });

  // ─── C. requiresPermission exhaustive ─────────────────────────────────────

  describe('C. requiresPermission – minRisk thresholds', () => {
    describe('minRisk = "critical"', () => {
      it('critical command returns true', () => {
        expect(service.requiresPermission('Bash', { command: 'rm -rf /' }, 'critical')).toBe(true);
      });
      it('high command returns false', () => {
        expect(service.requiresPermission('Bash', { command: 'sudo apt update' }, 'critical')).toBe(false);
      });
      it('medium command returns false', () => {
        expect(service.requiresPermission('Bash', { command: 'npm install' }, 'critical')).toBe(false);
      });
      it('low command returns false', () => {
        expect(service.requiresPermission('Bash', { command: 'ls' }, 'critical')).toBe(false);
      });
    });

    describe('minRisk = "high"', () => {
      it('critical command returns true', () => {
        expect(service.requiresPermission('Bash', { command: 'rm -rf /' }, 'high')).toBe(true);
      });
      it('high command returns true', () => {
        expect(service.requiresPermission('Bash', { command: 'sudo apt update' }, 'high')).toBe(true);
      });
      it('medium command returns false', () => {
        expect(service.requiresPermission('Bash', { command: 'npm install' }, 'high')).toBe(false);
      });
      it('low command returns false', () => {
        expect(service.requiresPermission('Bash', { command: 'ls' }, 'high')).toBe(false);
      });
    });

    describe('minRisk = "medium"', () => {
      it('critical command returns true', () => {
        expect(service.requiresPermission('Bash', { command: 'rm -rf /' }, 'medium')).toBe(true);
      });
      it('high command returns true', () => {
        expect(service.requiresPermission('Bash', { command: 'sudo apt update' }, 'medium')).toBe(true);
      });
      it('medium command returns true', () => {
        expect(service.requiresPermission('Bash', { command: 'npm install' }, 'medium')).toBe(true);
      });
      it('low command returns false', () => {
        expect(service.requiresPermission('Bash', { command: 'ls' }, 'medium')).toBe(false);
      });
    });

    describe('minRisk = "low"', () => {
      it('critical command returns true', () => {
        expect(service.requiresPermission('Bash', { command: 'rm -rf /' }, 'low')).toBe(true);
      });
      it('high command returns true', () => {
        expect(service.requiresPermission('Bash', { command: 'sudo apt update' }, 'low')).toBe(true);
      });
      it('medium command returns true', () => {
        expect(service.requiresPermission('Bash', { command: 'npm install' }, 'low')).toBe(true);
      });
      it('low command returns true', () => {
        expect(service.requiresPermission('Bash', { command: 'ls' }, 'low')).toBe(true);
      });
    });

    describe('default minRisk (no third argument)', () => {
      it('high-risk command returns true with default threshold', () => {
        expect(service.requiresPermission('Bash', { command: 'sudo apt update' })).toBe(true);
      });
      it('medium-risk command returns false with default threshold', () => {
        expect(service.requiresPermission('Bash', { command: 'npm install' })).toBe(false);
      });
      it('low-risk command returns false with default threshold', () => {
        expect(service.requiresPermission('Bash', { command: 'ls' })).toBe(false);
      });
      it('critical command returns true with default threshold', () => {
        expect(service.requiresPermission('Bash', { command: 'rm -rf /' })).toBe(true);
      });
    });
  });

  // ─── D. Request lifecycle ──────────────────────────────────────────────────

  describe('D. Request lifecycle', () => {
    it('hasPending returns false before createRequest', () => {
      expect(service.hasPending('req-x')).toBe(false);
    });

    it('hasPending returns true after createRequest', () => {
      service.createRequest('req-pending', 5000);
      expect(service.hasPending('req-pending')).toBe(true);
    });

    it('hasPending returns false after resolveRequest', () => {
      service.createRequest('req-resolve', 5000);
      service.resolveRequest('req-resolve', 'allow');
      expect(service.hasPending('req-resolve')).toBe(false);
    });

    it('resolves to allow when user allows', async () => {
      const promise = service.createRequest('req-allow', 5000);
      service.resolveRequest('req-allow', 'allow');
      await expect(promise).resolves.toBe('allow');
    });

    it('resolves to deny when user denies', async () => {
      const promise = service.createRequest('req-deny', 5000);
      service.resolveRequest('req-deny', 'deny');
      await expect(promise).resolves.toBe('deny');
    });

    it('resolveRequest returns true when request exists', () => {
      service.createRequest('req-exists', 5000);
      expect(service.resolveRequest('req-exists', 'allow')).toBe(true);
    });

    it('resolveRequest returns false for unknown requestId', () => {
      expect(service.resolveRequest('unknown-id', 'allow')).toBe(false);
    });

    it('resolveRequest after clearAll returns false', () => {
      service.createRequest('req-cleared', 5000);
      service.clearAll();
      expect(service.resolveRequest('req-cleared', 'allow')).toBe(false);
    });

    it('auto-resolves to deny on timeout (fail-closed)', async () => {
      // SECURITY: timeout must resolve to 'deny' (fail-closed), not 'allow'.
      // Failing open would let connection drops bypass permission checks.
      const promise = service.createRequest('req-timeout', 50);
      await expect(promise).resolves.toBe('deny');
    }, 1000);

    it('hasPending is false after timeout elapses', async () => {
      service.createRequest('req-expired', 50);
      await new Promise((r) => setTimeout(r, 100));
      expect(service.hasPending('req-expired')).toBe(false);
    }, 1000);

    it('resolving immediately then trying again returns false', async () => {
      const promise = service.createRequest('req-double', 5000);
      const first = service.resolveRequest('req-double', 'allow');
      const second = service.resolveRequest('req-double', 'deny');
      expect(first).toBe(true);
      expect(second).toBe(false);
      await expect(promise).resolves.toBe('allow');
    });

    it('creating two requests with the same ID — second replaces first (hasPending still true)', () => {
      service.createRequest('req-dup', 5000);
      service.createRequest('req-dup', 5000); // second call, same ID
      expect(service.hasPending('req-dup')).toBe(true);
    });
  });

  // ─── E. Concurrent requests ────────────────────────────────────────────────

  describe('E. Concurrent requests', () => {
    it('resolves 5 concurrent requests in reverse order with correct decisions', async () => {
      const ids = ['c1', 'c2', 'c3', 'c4', 'c5'];
      const decisions: Array<'allow' | 'deny'> = ['allow', 'deny', 'allow', 'deny', 'allow'];

      const promises = ids.map((id) => service.createRequest(id, 10000));

      // Resolve in reverse order
      for (let i = ids.length - 1; i >= 0; i--) {
        service.resolveRequest(ids[i]!, decisions[i]!);
      }

      const results = await Promise.all(promises);
      expect(results).toEqual(decisions);
    });

    it('clearAll denies all pending requests', async () => {
      const p1 = service.createRequest('cc1', 10000);
      const p2 = service.createRequest('cc2', 10000);
      const p3 = service.createRequest('cc3', 10000);

      service.clearAll();

      const [d1, d2, d3] = await Promise.all([p1, p2, p3]);
      expect(d1).toBe('deny');
      expect(d2).toBe('deny');
      expect(d3).toBe('deny');
    });

    it('after clearAll no requests are pending', () => {
      service.createRequest('ex1', 10000);
      service.createRequest('ex2', 10000);
      service.clearAll();
      expect(service.hasPending('ex1')).toBe(false);
      expect(service.hasPending('ex2')).toBe(false);
    });
  });
});
