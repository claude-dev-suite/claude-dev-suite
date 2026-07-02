// SPDX-License-Identifier: MIT
/**
 * Permission Service
 *
 * Classifies tool-use operations by risk level and manages
 * pending permission requests (pause-and-abort model).
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type PermissionDecision = 'allow' | 'deny';

export interface OperationRisk {
  risk: RiskLevel;
  category: string;
  description: string;
}

interface PendingPermission {
  requestId: string;
  resolve: (decision: PermissionDecision) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// Patterns for critical Bash operations
const CRITICAL_BASH = /\brm\s+(-[rRf]+\s+|--force\s+|--recursive\s+)*[/~]|rmdir\s|shred\s|wipe\s|dd\s+.*\bof=|mkfs\b|format\s+[A-Z]:|deltree\b/i;
const HIGH_BASH = /\bsudo\b|\bsu\s|\bchmod\s+[0-7]*7|\bchown\b|\bcurl\b.*https?:\/\/|\bwget\b.*https?:\/\/|\bnc\s|\bncat\b|\bnetcat\b/i;
const MEDIUM_BASH = /\bnpm\s+install\b(?!.*--dry-run)|\bpip\s+install\b(?!.*--dry-run)|\bapt(-get)?\s+install\b|\bbrew\s+install\b|\bgit\s+(push|reset\s+--hard|clean\s+-f)\b/i;
const SENSITIVE_FILE = /\.(env|key|pem|p12|pfx|jks|secrets?|credentials?|password|token|private)$|[/\\](etc|\.ssh|\.config|\.aws|\.kube)[/\\]/i;

export class PermissionService {
  private pending = new Map<string, PendingPermission>();

  /**
   * Classify the risk of a tool operation.
   */
  classifyOperation(toolName: string, input: Record<string, unknown>): OperationRisk {
    switch (toolName) {
      case 'Bash': {
        const cmd = String(input.command ?? '').trim();
        if (CRITICAL_BASH.test(cmd)) {
          return { risk: 'critical', category: 'Destructive shell command', description: cmd.slice(0, 120) };
        }
        if (HIGH_BASH.test(cmd)) {
          return { risk: 'high', category: 'Privileged / network shell command', description: cmd.slice(0, 120) };
        }
        if (MEDIUM_BASH.test(cmd)) {
          return { risk: 'medium', category: 'Package installation', description: cmd.slice(0, 120) };
        }
        return { risk: 'low', category: 'Shell command', description: cmd.slice(0, 120) };
      }
      case 'Write': {
        const filePath = String(input.file_path ?? input.path ?? '');
        if (SENSITIVE_FILE.test(filePath)) {
          return { risk: 'critical', category: 'Sensitive file write', description: filePath };
        }
        return { risk: 'low', category: 'File write', description: filePath };
      }
      case 'Edit': {
        const filePath = String(input.file_path ?? '');
        if (SENSITIVE_FILE.test(filePath)) {
          return { risk: 'high', category: 'Sensitive file edit', description: filePath };
        }
        return { risk: 'low', category: 'File edit', description: filePath };
      }
      default:
        return { risk: 'low', category: toolName, description: JSON.stringify(input).slice(0, 80) };
    }
  }

  /**
   * Check whether an operation meets the minimum risk threshold for user confirmation.
   */
  requiresPermission(toolName: string, input: Record<string, unknown>, minRisk: RiskLevel = 'high'): boolean {
    const order: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    const { risk } = this.classifyOperation(toolName, input);
    return order.indexOf(risk) >= order.indexOf(minRisk);
  }

  /**
   * Register a pending permission request and return a Promise
   * that resolves to the user's decision.
   *
   * SECURITY: Automatically resolves to 'deny' (fail-closed) after timeoutMs
   * if no explicit user decision is made.  Failing open ('allow') would let an
   * attacker exploit connection drops or network delays to bypass approval.
   */
  createRequest(requestId: string, timeoutMs = 30_000): Promise<PermissionDecision> {
    return new Promise<PermissionDecision>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        resolve('deny'); // fail-closed: no decision = deny
      }, timeoutMs);
      this.pending.set(requestId, { requestId, resolve, timeout });
    });
  }

  /**
   * Resolve a pending permission request.
   * Returns true if the requestId was found.
   */
  resolveRequest(requestId: string, decision: PermissionDecision): boolean {
    const p = this.pending.get(requestId);
    if (!p) return false;
    clearTimeout(p.timeout);
    this.pending.delete(requestId);
    p.resolve(decision);
    return true;
  }

  hasPending(requestId: string): boolean {
    return this.pending.has(requestId);
  }

  /** Deny and clear all pending requests (e.g. on job abort). */
  clearAll(): void {
    for (const { timeout, resolve } of this.pending.values()) {
      clearTimeout(timeout);
      resolve('deny');
    }
    this.pending.clear();
  }
}
