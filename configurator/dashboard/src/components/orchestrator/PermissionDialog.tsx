// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PermissionRequest {
  requestId: string;
  jobId: string;
  toolName: string;
  input: Record<string, unknown>;
  risk: RiskLevel;
  category: string;
  description: string;
  timeoutMs: number;
  receivedAt: number;
}

interface PermissionDialogProps {
  request: PermissionRequest;
  onDecision: (requestId: string, decision: 'allow' | 'deny') => void;
}

const RISK_STYLES: Record<RiskLevel, { border: string; badge: string; icon: string }> = {
  low: { border: 'border-surface-600', badge: 'bg-surface-700 text-surface-300', icon: 'ℹ️' },
  medium: { border: 'border-yellow-500', badge: 'bg-yellow-900/60 text-yellow-300', icon: '⚠️' },
  high: { border: 'border-orange-500', badge: 'bg-orange-900/60 text-orange-300', icon: '🔶' },
  critical: { border: 'border-red-500', badge: 'bg-red-900/60 text-red-300', icon: '🚨' },
};

export function PermissionDialog({ request, onDecision }: PermissionDialogProps) {
  const [remaining, setRemaining] = useState(Math.floor(request.timeoutMs / 1000));
  const styles = RISK_STYLES[request.risk];

  useEffect(() => {
    const end = request.receivedAt + request.timeoutMs;
    const interval = setInterval(() => {
      const secs = Math.max(0, Math.round((end - Date.now()) / 1000));
      setRemaining(secs);
      if (secs === 0) {
        clearInterval(interval);
        onDecision(request.requestId, 'allow');
      }
    }, 500);
    return () => clearInterval(interval);
  }, [request, onDecision]);

  return (
    <div
      data-testid="permission-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div
        className={`relative w-full max-w-lg mx-4 bg-surface-900 border-2 ${styles.border} rounded-xl shadow-2xl p-6`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl leading-none mt-0.5">{styles.icon}</span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">Permission Required</h2>
            <p className="text-sm text-surface-400 mt-0.5">
              Claude wants to perform a {request.risk} risk operation
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${styles.badge}`}>
            {request.risk}
          </span>
        </div>

        {/* Operation details */}
        <div className="bg-surface-800 rounded-lg p-4 mb-4 space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-surface-400 flex-shrink-0 w-20">Tool</span>
            <code className="text-primary-300 font-mono">{request.toolName}</code>
          </div>
          <div className="flex gap-2">
            <span className="text-surface-400 flex-shrink-0 w-20">Category</span>
            <span className="text-surface-200">{request.category}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-surface-400 flex-shrink-0 w-20">Operation</span>
            <code className="text-surface-200 font-mono break-all">{request.description}</code>
          </div>
        </div>

        {/* Warning note */}
        <p className="text-xs text-surface-500 mb-5">
          Note: Denying will abort the entire job. The operation may have already started.
          Auto-allowing in <span className="text-white font-mono">{remaining}s</span>.
        </p>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            data-testid="permission-deny"
            onClick={() => onDecision(request.requestId, 'deny')}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
          >
            Deny & Abort Job
          </button>
          <button
            data-testid="permission-allow"
            onClick={() => onDecision(request.requestId, 'allow')}
            className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            Allow ({remaining}s)
          </button>
        </div>
      </div>
    </div>
  );
}
