// SPDX-License-Identifier: MIT
/**
 * Reinstall Panel
 *
 * Erase-and-replace reinstall/sync UI: shows the selection summary, locally
 * modified managed files (with per-file Overwrite/Keep opt-out), orphans to be
 * removed, and a transactional Reinstall action.
 */

import { Button, Badge } from '../common';
import { useReinstall } from '@/hooks';
import clsx from 'clsx';

export interface ReinstallPanelProps {
  projectPath: string;
}

export function ReinstallPanel({ projectPath }: ReinstallPanelProps) {
  const {
    previewResult,
    isPreviewing,
    previewError,
    refreshPreview,
    executeResult,
    isExecuting,
    executeError,
    resolutions,
    setResolution,
    reinstall,
  } = useReinstall({ projectPath, autoPreview: true });

  if (isPreviewing && !previewResult) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mb-4" />
        <p className="text-surface-400">Analyzing project…</p>
      </div>
    );
  }

  if (previewError) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
        <h3 className="text-red-400 font-medium mb-2">Error analyzing project</h3>
        <p className="text-red-400/80 text-sm">{previewError}</p>
        <Button variant="ghost" onClick={refreshPreview} className="mt-4">Retry</Button>
      </div>
    );
  }

  if (previewResult && !previewResult.hasValidManifest) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-surface-300 mb-2">No Installation Manifest</h3>
        <p className="text-sm text-surface-400 max-w-md mx-auto">
          {previewResult.reason ?? 'dev-suite is not installed in this project.'}
        </p>
      </div>
    );
  }

  const modified = previewResult?.modifiedManagedFiles ?? [];
  const orphans = previewResult?.orphansToRemove ?? [];

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <div className="p-4 bg-surface-800/50 rounded-lg">
        <h3 className="text-base font-medium text-white mb-1">Reinstall / Sync (erase &amp; replace)</h3>
        <p className="text-sm text-surface-400">
          Erases dev-suite-managed files and re-installs them from the current source,
          removing components no longer selected. Your custom agents/skills, your
          <code className="mx-1 text-surface-300">CLAUDE.md</code> notes, and your
          <code className="mx-1 text-surface-300">settings.json</code> keys are preserved.
          A backup is created first and any failure rolls back automatically.
        </p>
      </div>

      {/* Selection summary */}
      {previewResult && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">{previewResult.selection.agents.length} agents</Badge>
          <Badge variant="default">{previewResult.selection.mcpServers.length} MCP servers</Badge>
          <Badge variant="default">{previewResult.selection.rules.length} rules</Badge>
          <Badge variant="default">{previewResult.skillDirsToRebuild} skill dirs rebuilt</Badge>
          {orphans.length > 0 && <Badge variant="warning">{orphans.length} to remove</Badge>}
          {modified.length > 0 && <Badge variant="warning">{modified.length} modified</Badge>}
        </div>
      )}

      {/* Orphans */}
      {orphans.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-surface-300 mb-2">Will be removed (no longer selected)</h4>
          <ul className="space-y-1">
            {orphans.map(p => (
              <li key={p} className="text-sm text-surface-400 font-mono">{p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Modified managed files → opt-out */}
      {modified.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-surface-300 mb-2">
            Locally modified files — choose what to do
          </h4>
          <div className="space-y-2">
            {modified.map(f => {
              const choice = resolutions[f.path] ?? 'overwrite';
              return (
                <div
                  key={f.path}
                  className="flex items-center justify-between p-3 bg-surface-800/50 rounded-lg"
                >
                  <span className="text-sm text-surface-300 font-mono truncate mr-4">{f.path}</span>
                  <div className="flex gap-1 shrink-0">
                    {(['overwrite', 'keep'] as const).map(opt => (
                      <button
                        key={opt}
                        onClick={() => setResolution(f.path, opt)}
                        className={clsx(
                          'px-3 py-1 text-xs rounded-md transition-colors',
                          choice === opt
                            ? 'bg-primary-500 text-white'
                            : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
                        )}
                      >
                        {opt === 'overwrite' ? 'Overwrite' : 'Keep mine'}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Result banners */}
      {executeResult?.success && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-300 space-y-1">
          <p className="font-medium">Reinstall complete.</p>
          <p>
            {executeResult.agentsReinstalled.length} agents, {executeResult.mcpReinstalled.length} MCP servers
            reinstalled · {executeResult.orphansRemoved.length} removed · {executeResult.keptFiles.length} kept.
          </p>
          {executeResult.backupDir && (
            <p className="text-green-300/70 font-mono text-xs">backup: {executeResult.backupDir}</p>
          )}
          {executeResult.verifyWarnings.map(w => (
            <p key={w} className="text-yellow-300/80">⚠ {w}</p>
          ))}
        </div>
      )}
      {executeResult && !executeResult.success && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
          {executeResult.rolledBack
            ? `Reinstall failed and was rolled back — no changes applied: ${executeResult.error}`
            : `Reinstall failed: ${executeResult.error}`}
        </div>
      )}
      {executeError && !executeResult && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
          {executeError}
        </div>
      )}

      {/* Action */}
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={() => reinstall(true)} disabled={isExecuting || isPreviewing}>
          {isExecuting ? 'Reinstalling…' : 'Reinstall / Sync'}
        </Button>
        <Button variant="ghost" onClick={refreshPreview} disabled={isExecuting || isPreviewing}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
