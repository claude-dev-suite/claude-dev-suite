// SPDX-License-Identifier: MIT
/**
 * Updates Tab Component
 *
 * Single update mechanism: erase-and-replace Reinstall / Sync. Shows an explicit
 * version panel (installed-in-project vs available-from-source) on top, then the
 * ReinstallPanel. The incremental feature-upgrade UI was retired in favour of the
 * transactional reinstall flow, which fully re-aligns a project to the current
 * source (backup + rollback, orphan removal, per-file opt-out).
 */

import { Button, Badge } from '../common';
import { useUpgrade } from '@/hooks';
import { ReinstallPanel } from './ReinstallPanel';

export interface UpdatesTabProps {
  projectPath: string;
}

/** Compare two semver-ish strings. Returns -1 (a<b), 0 (a==b), 1 (a>b). */
function compareSemver(a: string, b: string): number {
  const norm = (v: string) => v.replace(/^v/, '').split('-')[0] ?? ''; // drop leading v + pre-release
  const pa = norm(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = norm(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

interface VersionPanelProps {
  installed?: string;
  current?: string;
  isChecking: boolean;
  onRefresh: () => void;
}

function VersionPanel({ installed, current, isChecking, onRefresh }: VersionPanelProps) {
  const hasBoth = Boolean(installed && current);
  const updateAvailable = hasBoth ? compareSemver(installed!, current!) < 0 : false;

  return (
    <div className="p-4 bg-surface-800/50 rounded-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-1">
          <div>
            <p className="text-xs uppercase tracking-wide text-surface-500">Installed in project</p>
            <p className="text-lg font-semibold text-white font-mono">
              {installed ? `v${installed}` : 'Not installed'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-surface-500">Available from source</p>
            <p className="text-lg font-semibold text-white font-mono">
              {current ? `v${current}` : '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasBoth && (
            <Badge variant={updateAvailable ? 'warning' : 'success'}>
              {updateAvailable ? 'Update available' : 'Up to date'}
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isChecking}>
            {isChecking ? 'Checking…' : 'Re-check'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function UpdatesTab({ projectPath }: UpdatesTabProps) {
  // The upgrade check endpoint is kept solely as the source of truth for the
  // installed-vs-source version numbers; the feature-upgrade UI is retired.
  const { checkResult, isChecking, checkUpgrades } = useUpgrade({
    projectPath,
    autoCheck: true,
  });

  return (
    <div className="space-y-6">
      <VersionPanel
        installed={checkResult?.installedVersion}
        current={checkResult?.currentDevSuiteVersion}
        isChecking={isChecking}
        onRefresh={checkUpgrades}
      />
      <ReinstallPanel projectPath={projectPath} />
    </div>
  );
}
