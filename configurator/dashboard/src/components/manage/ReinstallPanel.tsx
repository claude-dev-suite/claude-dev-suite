// SPDX-License-Identifier: MIT
/**
 * Reinstall Panel
 *
 * Erase-and-replace reinstall/sync UI: shows the selection summary, a drift
 * banner, locally modified managed files (with a per-file Overwrite / Keep /
 * Adopt choice), orphans to be removed, and a transactional Reinstall action.
 *
 * The three-way choice exists because "keep" and "adopt" are genuinely
 * different decisions: keeping is "not this run", adopting is "this content is
 * correct now, stop asking". Collapsing them into one button either nags
 * forever or silently suppresses a warning nobody remembers dismissing.
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
    driftReport,
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
  const drift = driftReport ?? previewResult?.drift ?? null;
  const unresolved = modified.filter(f => !f.acknowledged);
  const adopted = modified.filter(f => f.acknowledged);

  const RESOLUTION_LABELS = {
    overwrite: 'Overwrite',
    keep: 'Keep (this time)',
    promote: 'Adopt',
  } as const;

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

      {/* Drift banner */}
      {drift?.hasActionableDrift && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <h4 className="text-yellow-300 font-medium mb-1">
            {drift.counts.drifted} managed {drift.counts.drifted === 1 ? 'file has' : 'files have'} changed since dev-suite wrote {drift.counts.drifted === 1 ? 'it' : 'them'}
          </h4>
          <p className="text-sm text-yellow-300/80">
            Something outside the dashboard edited them — an agent, a script, or a hand edit.
            Reinstalling overwrites the changes unless you keep or adopt each file below.
            {drift.counts.driftedOutsideSection > 0 && (
              <> {drift.counts.driftedOutsideSection} further {drift.counts.driftedOutsideSection === 1 ? 'file was' : 'files were'} edited outside the dev-suite markers — that is your own content and is left alone.</>
            )}
          </p>
        </div>
      )}

      {/* Selection summary */}
      {previewResult && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">{previewResult.selection.agents.length} agents</Badge>
          <Badge variant="default">{previewResult.selection.mcpServers.length} MCP servers</Badge>
          <Badge variant="default">{previewResult.selection.rules.length} rules</Badge>
          <Badge variant="default">{previewResult.skillDirsToRebuild} skill dirs rebuilt</Badge>
          {orphans.length > 0 && <Badge variant="warning">{orphans.length} to remove</Badge>}
          {unresolved.length > 0 && <Badge variant="warning">{unresolved.length} modified</Badge>}
          {adopted.length > 0 && <Badge variant="default">{adopted.length} adopted</Badge>}
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
          <p className="text-xs text-surface-500 mb-2">
            <span className="text-surface-400">Overwrite</span> replaces the file ·
            <span className="text-surface-400"> Keep</span> preserves it for this run only ·
            <span className="text-surface-400"> Adopt</span> preserves it and marks the content as intentional.
          </p>
          <div className="space-y-2">
            {modified.map(f => {
              const choice = resolutions[f.path] ?? (f.acknowledged ? 'promote' : 'overwrite');
              return (
                <div
                  key={f.path}
                  className="flex items-center justify-between p-3 bg-surface-800/50 rounded-lg"
                >
                  <div className="min-w-0 mr-4">
                    <span className="block text-sm text-surface-300 font-mono truncate">{f.path}</span>
                    <span className="text-xs text-surface-500">
                      {f.currentHash === '(deleted)'
                        ? 'missing on disk — will be recreated'
                        : f.scope === 'managed-section'
                          ? 'changed inside the dev-suite markers'
                          : 'whole file changed'}
                      {f.acknowledged && ' · adopted earlier'}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {(['overwrite', 'keep', 'promote'] as const).map(opt => (
                      <button
                        key={opt}
                        onClick={() => setResolution(f.path, opt)}
                        title={
                          opt === 'overwrite'
                            ? 'Replace with the version dev-suite generates'
                            : opt === 'keep'
                              ? 'Preserve this version for this run; it will be reported again next time'
                              : 'Preserve this version and stop reporting it as drift'
                        }
                        className={clsx(
                          'px-3 py-1 text-xs rounded-md transition-colors',
                          choice === opt
                            ? 'bg-primary-500 text-white'
                            : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
                        )}
                      >
                        {RESOLUTION_LABELS[opt]}
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
            reinstalled · {executeResult.orphansRemoved.length} removed · {executeResult.keptFiles.length} kept
            {(executeResult.promotedFiles?.length ?? 0) > 0 && ` · ${executeResult.promotedFiles?.length} adopted`}.
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
