// SPDX-License-Identifier: MIT
export interface OrchestratorHeaderProps {
  connected: boolean;
  wsStatusText: string;
}

export function OrchestratorHeader({ connected, wsStatusText }: OrchestratorHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' }}
          >
            O
          </span>
          Task Orchestrator
        </h2>

        {/* Connection Status Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-800 border border-surface-700 rounded-lg">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: connected ? '#22c55e' : '#6b7280' }}
          />
          <span className="text-sm text-surface-400">{wsStatusText}</span>
        </div>
      </div>
    </div>
  );
}
