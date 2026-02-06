// SPDX-License-Identifier: MIT
/**
 * Updates Tab Component
 *
 * Displays available feature updates and allows applying upgrades.
 */

import { useState } from 'react';
import { useUpgrade } from '@/hooks';
import { Button, Badge } from '../common';
import { UpdateCard } from './UpdateCard';
import { ConflictModal } from './ConflictModal';
import { UpgradeHistoryList } from './UpgradeHistoryList';
import type { AvailableUpgrade, ConflictResolution } from '@/types';
import clsx from 'clsx';

export interface UpdatesTabProps {
  projectPath: string;
}

type ViewMode = 'available' | 'history';

export function UpdatesTab({ projectPath }: UpdatesTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('available');
  const [conflictModalData, setConflictModalData] = useState<{
    upgrade: AvailableUpgrade;
    isOpen: boolean;
  } | null>(null);

  const {
    checkResult,
    isChecking,
    checkError,
    isExecuting,
    executeError,
    selectedFeatures,
    toggleFeature,
    selectAllApplicable,
    deselectAll,
    resolutions,
    setResolution,
    checkUpgrades,
    executeUpgrade,
    upgradeCount,
    hasUpgrades,
    applicableUpgrades,
    featureCards,
    history,
    isLoadingHistory,
    installPackages,
    installAgent,
  } = useUpgrade({ projectPath, autoCheck: true });

  const handleInstallPackage = async (packageName: string): Promise<boolean> => {
    const result = await installPackages([packageName], true);
    return result?.success ?? false;
  };

  const handleInstallAgent = async (agentId: string): Promise<boolean> => {
    const result = await installAgent(agentId);
    return result?.success ?? false;
  };

  const handleApplySelected = async () => {
    if (selectedFeatures.length === 0) return;

    // Check if any selected features have conflicts that need resolution
    const selectedWithConflicts = checkResult?.availableUpgrades.filter(
      u => selectedFeatures.includes(u.feature.id) && u.conflicts.length > 0
    ) || [];

    if (selectedWithConflicts.length > 0) {
      // Show conflict modal for first feature with conflicts
      const firstWithConflict = selectedWithConflicts[0];
      if (firstWithConflict) {
        setConflictModalData({
          upgrade: firstWithConflict,
          isOpen: true,
        });
        return;
      }
    }

    await executeUpgrade();
  };

  const handleResolveConflict = (
    featureId: string,
    target: string,
    resolution: ConflictResolution
  ) => {
    setResolution(featureId, target, resolution);
  };

  const handleCloseConflictModal = () => {
    setConflictModalData(null);
  };

  const handleApplyWithResolution = async () => {
    setConflictModalData(null);
    await executeUpgrade();
  };

  // Loading state
  if (isChecking && !checkResult) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mb-4" />
        <p className="text-surface-400">Checking for updates...</p>
      </div>
    );
  }

  // Error state
  if (checkError) {
    return (
      <div className="p-6">
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <h3 className="text-red-400 font-medium mb-2">Error checking updates</h3>
          <p className="text-red-400/80 text-sm">{checkError}</p>
          <Button variant="ghost" onClick={checkUpgrades} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // No manifest state
  if (checkResult && !checkResult.hasValidManifest) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-16 h-16 mx-auto text-surface-600 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <h3 className="text-lg font-medium text-surface-300 mb-2">
          No Installation Manifest
        </h3>
        <p className="text-sm text-surface-400 max-w-md mx-auto">
          The project manifest is missing or invalid. Please reinstall dev-suite
          to enable the upgrade feature.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h3 className="text-lg font-medium text-white">Feature Updates</h3>
            <p className="text-sm text-surface-400 mt-0.5">
              {checkResult?.installedVersion
                ? `Installed: v${checkResult.installedVersion}`
                : 'Unknown version'}
              {' → '}
              Current: v{checkResult?.currentDevSuiteVersion}
            </p>
          </div>
          {hasUpgrades && (
            <Badge variant="warning">{upgradeCount} update{upgradeCount !== 1 ? 's' : ''}</Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={checkUpgrades}
            disabled={isChecking}
          >
            {isChecking ? 'Checking...' : 'Check for Updates'}
          </Button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex gap-1 border-b border-surface-700">
        <button
          onClick={() => setViewMode('available')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            viewMode === 'available'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-surface-400 hover:text-white'
          )}
        >
          Available
          {upgradeCount > 0 && (
            <Badge variant="default" className="ml-2">{upgradeCount}</Badge>
          )}
        </button>
        <button
          onClick={() => setViewMode('history')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            viewMode === 'history'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-surface-400 hover:text-white'
          )}
        >
          History
          {history.length > 0 && (
            <Badge variant="default" className="ml-2">{history.length}</Badge>
          )}
        </button>
      </div>

      {viewMode === 'available' ? (
        <>
          {/* Selection Actions */}
          {applicableUpgrades.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-surface-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-sm text-surface-400">
                  {selectedFeatures.length} of {applicableUpgrades.length} selected
                </span>
                <Button variant="ghost" size="sm" onClick={selectAllApplicable}>
                  Select All
                </Button>
                {selectedFeatures.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    Deselect All
                  </Button>
                )}
              </div>
              {selectedFeatures.length > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApplySelected}
                  disabled={isExecuting}
                >
                  {isExecuting ? 'Applying...' : `Apply ${selectedFeatures.length} Update${selectedFeatures.length !== 1 ? 's' : ''}`}
                </Button>
              )}
            </div>
          )}

          {/* Execute Error */}
          {executeError && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{executeError}</p>
            </div>
          )}

          {/* Feature Cards */}
          <div className="space-y-3">
            {featureCards.length === 0 ? (
              <div className="text-center py-12">
                <svg
                  className="w-12 h-12 mx-auto text-green-500 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <h3 className="text-lg font-medium text-surface-300 mb-2">
                  All Up to Date
                </h3>
                <p className="text-sm text-surface-400">
                  No feature updates available at this time.
                </p>
              </div>
            ) : (
              featureCards.map((card) => {
                const upgrade = checkResult?.availableUpgrades.find(
                  u => u.feature.id === card.feature.id
                );
                return (
                  <UpdateCard
                    key={card.feature.id}
                    card={card}
                    upgrade={upgrade}
                    isSelected={selectedFeatures.includes(card.feature.id)}
                    onToggle={() => toggleFeature(card.feature.id)}
                    onViewConflicts={() => {
                      if (upgrade) {
                        setConflictModalData({ upgrade, isOpen: true });
                      }
                    }}
                    resolutions={resolutions[card.feature.id]}
                    onInstallPackage={handleInstallPackage}
                    onInstallAgent={handleInstallAgent}
                  />
                );
              })
            )}
          </div>
        </>
      ) : (
        <UpgradeHistoryList
          history={history}
          isLoading={isLoadingHistory}
        />
      )}

      {/* Conflict Modal */}
      {conflictModalData && (
        <ConflictModal
          isOpen={conflictModalData.isOpen}
          upgrade={conflictModalData.upgrade}
          resolutions={resolutions[conflictModalData.upgrade.feature.id] || {}}
          onResolve={(target, resolution) =>
            handleResolveConflict(conflictModalData.upgrade.feature.id, target, resolution)
          }
          onClose={handleCloseConflictModal}
          onApply={handleApplyWithResolution}
        />
      )}
    </div>
  );
}
