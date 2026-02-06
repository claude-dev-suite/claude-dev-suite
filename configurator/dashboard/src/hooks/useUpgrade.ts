// SPDX-License-Identifier: MIT
/**
 * Upgrade Hook
 *
 * Custom hook for managing feature upgrades in dev-suite projects.
 * Handles checking, previewing, and executing upgrades with conflict resolution.
 */

import { useState, useCallback, useMemo } from 'react';
import { useApi, invalidateCache } from './useApi';
import { useMutation } from './useMutation';
import type {
  UpgradeCheckResult,
  UpgradePreviewResult,
  UpgradeExecuteResult,
  UpgradeExecuteRequest,
  ConflictResolution,
  AvailableUpgrade,
  FeatureCardInfo,
  UpgradeHistoryEntry,
  InstallPackageRequest,
  InstallPackageResult,
  InstallAgentRequest,
  InstallAgentResult,
} from '@/types';
import { getLogger } from '@/utils/logger';

const logger = getLogger('useUpgrade');

export interface UseUpgradeOptions {
  /** Project path to check for upgrades */
  projectPath: string;
  /** Auto-check on mount (default: false) */
  autoCheck?: boolean;
}

export interface UseUpgradeResult {
  // Check result
  checkResult: UpgradeCheckResult | null;
  isChecking: boolean;
  checkError: string | null;

  // Preview result
  previewResult: UpgradePreviewResult | null;
  isPreviewing: boolean;
  previewError: string | null;

  // Execute result
  executeResult: UpgradeExecuteResult | null;
  isExecuting: boolean;
  executeError: string | null;

  // History
  history: UpgradeHistoryEntry[];
  isLoadingHistory: boolean;

  // Selected features
  selectedFeatures: string[];
  setSelectedFeatures: (ids: string[]) => void;
  toggleFeature: (id: string) => void;
  selectAllApplicable: () => void;
  deselectAll: () => void;

  // Conflict resolutions
  resolutions: Record<string, Record<string, ConflictResolution>>;
  setResolution: (featureId: string, target: string, resolution: ConflictResolution) => void;
  clearResolutions: () => void;

  // Actions
  checkUpgrades: () => Promise<void>;
  previewUpgrade: (featureIds?: string[]) => Promise<void>;
  executeUpgrade: (featureIds?: string[], createBackup?: boolean) => Promise<void>;
  refreshHistory: () => void;
  installPackages: (packages: string[], dev?: boolean) => Promise<InstallPackageResult | null>;
  installAgent: (agentId: string) => Promise<InstallAgentResult | null>;

  // Install state
  isInstallingPackage: boolean;
  isInstallingAgent: boolean;
  installError: string | null;

  // Computed values
  upgradeCount: number;
  hasUpgrades: boolean;
  applicableUpgrades: AvailableUpgrade[];
  featureCards: FeatureCardInfo[];
  hasConflicts: boolean;
  conflictCount: number;
}

/**
 * Hook for managing feature upgrades
 */
export function useUpgrade(options: UseUpgradeOptions): UseUpgradeResult {
  const { projectPath, autoCheck = false } = options;

  // Selected features and resolutions state
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, Record<string, ConflictResolution>>>({});

  // Check upgrades API call
  const {
    data: checkResult,
    loading: isChecking,
    error: checkError,
    refetch: refetchCheck,
  } = useApi<UpgradeCheckResult>(
    `/api/upgrade/check?path=${encodeURIComponent(projectPath)}`,
    { skip: !autoCheck }
  );

  // Preview state
  const [previewResult, setPreviewResult] = useState<UpgradePreviewResult | null>(null);

  // Execute state
  const [executeResult, setExecuteResult] = useState<UpgradeExecuteResult | null>(null);

  // Preview mutation
  const {
    loading: isPreviewing,
    error: previewError,
    mutate: previewMutate,
    reset: resetPreview,
  } = useMutation<UpgradePreviewResult, { path: string; featureIds?: string[] }>('/api/upgrade/preview');

  // Execute mutation
  const {
    loading: isExecuting,
    error: executeError,
    mutate: executeMutate,
    reset: resetExecute,
  } = useMutation<UpgradeExecuteResult, UpgradeExecuteRequest>('/api/upgrade/execute');

  // Install package mutation
  const {
    loading: isInstallingPackage,
    error: installPackageError,
    mutate: installPackageMutate,
  } = useMutation<InstallPackageResult, InstallPackageRequest>('/api/upgrade/install-package');

  // Install agent mutation
  const {
    loading: isInstallingAgent,
    error: installAgentError,
    mutate: installAgentMutate,
  } = useMutation<InstallAgentResult, InstallAgentRequest>('/api/upgrade/install-agent');

  // Upgrade history API call
  const {
    data: history,
    loading: isLoadingHistory,
    refetch: refreshHistory,
  } = useApi<UpgradeHistoryEntry[]>(
    `/api/upgrade/history?path=${encodeURIComponent(projectPath)}`,
    { skip: !projectPath }
  );

  // Toggle feature selection
  const toggleFeature = useCallback((id: string) => {
    setSelectedFeatures(prev =>
      prev.includes(id)
        ? prev.filter(f => f !== id)
        : [...prev, id]
    );
  }, []);

  // Select all applicable upgrades
  const selectAllApplicable = useCallback(() => {
    if (!checkResult) return;

    const applicable = checkResult.availableUpgrades
      .filter(u =>
        u.isCompatible &&
        (!u.isApplied || u.hasUpdate) &&
        u.missingDependencies.length === 0
      )
      .map(u => u.feature.id);

    setSelectedFeatures(applicable);
  }, [checkResult]);

  // Deselect all
  const deselectAll = useCallback(() => {
    setSelectedFeatures([]);
  }, []);

  // Set resolution for a conflict
  const setResolution = useCallback((
    featureId: string,
    target: string,
    resolution: ConflictResolution
  ) => {
    setResolutions(prev => ({
      ...prev,
      [featureId]: {
        ...(prev[featureId] || {}),
        [target]: resolution,
      },
    }));
  }, []);

  // Clear all resolutions
  const clearResolutions = useCallback(() => {
    setResolutions({});
  }, []);

  // Check upgrades action
  const checkUpgrades = useCallback(async () => {
    logger.info('Checking for upgrades', { projectPath });
    invalidateCache('/api/upgrade/check');
    await refetchCheck();
  }, [projectPath, refetchCheck]);

  // Preview upgrade action
  const previewUpgrade = useCallback(async (featureIds?: string[]) => {
    const ids = featureIds || selectedFeatures;
    if (ids.length === 0) {
      logger.warn('No features selected for preview');
      return;
    }

    logger.info('Previewing upgrade', { featureIds: ids });
    resetPreview();
    setPreviewResult(null);
    const result = await previewMutate({
      path: projectPath,
      featureIds: ids,
    });
    if (result) {
      setPreviewResult(result);
    }
  }, [projectPath, selectedFeatures, previewMutate, resetPreview]);

  // Execute upgrade action
  const executeUpgrade = useCallback(async (featureIds?: string[], createBackup = true) => {
    const ids = featureIds || selectedFeatures;
    if (ids.length === 0) {
      logger.warn('No features selected for upgrade');
      return;
    }

    logger.info('Executing upgrade', { featureIds: ids, createBackup });
    resetExecute();
    setExecuteResult(null);

    const result = await executeMutate({
      projectPath,
      featureIds: ids,
      resolutions: Object.keys(resolutions).length > 0 ? resolutions : undefined,
      createBackup,
    });

    if (result) {
      setExecuteResult(result);
    }

    // Refresh check after upgrade
    invalidateCache('/api/upgrade/check');
    invalidateCache('/api/upgrade/history');
    await refetchCheck();
    refreshHistory();

    // Clear selections after successful upgrade
    setSelectedFeatures([]);
    clearResolutions();
  }, [
    projectPath,
    selectedFeatures,
    resolutions,
    executeMutate,
    resetExecute,
    refetchCheck,
    refreshHistory,
    clearResolutions,
  ]);

  // Install packages action
  const installPackages = useCallback(async (packages: string[], dev = true): Promise<InstallPackageResult | null> => {
    logger.info('Installing packages', { packages, dev });

    const result = await installPackageMutate({
      projectPath,
      packages,
      dev,
    });

    if (result?.success) {
      // Refresh check after installing packages
      invalidateCache('/api/upgrade/check');
      await refetchCheck();
    }

    return result;
  }, [projectPath, installPackageMutate, refetchCheck]);

  // Install agent action
  const installAgent = useCallback(async (agentId: string): Promise<InstallAgentResult | null> => {
    logger.info('Installing agent', { agentId });

    const result = await installAgentMutate({
      projectPath,
      agentId,
    });

    if (result?.success) {
      // Refresh check after installing agent
      invalidateCache('/api/upgrade/check');
      await refetchCheck();
    }

    return result;
  }, [projectPath, installAgentMutate, refetchCheck]);

  // Computed: applicable upgrades
  const applicableUpgrades = useMemo(() => {
    if (!checkResult) return [];
    return checkResult.availableUpgrades.filter(u =>
      u.isCompatible &&
      (!u.isApplied || u.hasUpdate) &&
      u.missingDependencies.length === 0
    );
  }, [checkResult]);

  // Computed: feature cards for UI
  const featureCards = useMemo((): FeatureCardInfo[] => {
    if (!checkResult) return [];

    return checkResult.availableUpgrades.map(upgrade => {
      let status: FeatureCardInfo['status'];
      let statusLabel: string;
      let statusColor: FeatureCardInfo['statusColor'];
      let canApply = false;

      if (!upgrade.isCompatible) {
        status = 'incompatible';
        statusLabel = upgrade.incompatibilityReason || 'Incompatible';
        statusColor = 'gray';
      } else if (upgrade.isApplied && !upgrade.hasUpdate) {
        status = 'applied';
        statusLabel = `Applied (v${upgrade.appliedVersion})`;
        statusColor = 'green';
      } else if (upgrade.isApplied && upgrade.hasUpdate) {
        status = 'update-available';
        statusLabel = `Update: v${upgrade.appliedVersion} → v${upgrade.feature.version}`;
        statusColor = 'yellow';
        canApply = upgrade.missingDependencies.length === 0;
      } else {
        status = 'available';
        statusLabel = 'Available';
        statusColor = 'blue';
        canApply = upgrade.missingDependencies.length === 0;
      }

      return {
        feature: upgrade.feature,
        status,
        statusLabel,
        statusColor,
        canApply,
        hasConflicts: upgrade.conflicts.length > 0,
        conflictCount: upgrade.conflicts.length,
      };
    });
  }, [checkResult]);

  // Computed: total conflicts
  const conflictInfo = useMemo(() => {
    if (!checkResult) return { hasConflicts: false, conflictCount: 0 };

    const conflictCount = checkResult.availableUpgrades
      .filter(u => selectedFeatures.includes(u.feature.id))
      .reduce((sum, u) => sum + u.conflicts.length, 0);

    return {
      hasConflicts: conflictCount > 0,
      conflictCount,
    };
  }, [checkResult, selectedFeatures]);

  return {
    // Check result
    checkResult,
    isChecking,
    checkError,

    // Preview result
    previewResult,
    isPreviewing,
    previewError,

    // Execute result
    executeResult,
    isExecuting,
    executeError,

    // History
    history: history || [],
    isLoadingHistory,

    // Selected features
    selectedFeatures,
    setSelectedFeatures,
    toggleFeature,
    selectAllApplicable,
    deselectAll,

    // Conflict resolutions
    resolutions,
    setResolution,
    clearResolutions,

    // Actions
    checkUpgrades,
    previewUpgrade,
    executeUpgrade,
    refreshHistory,
    installPackages,
    installAgent,

    // Install state
    isInstallingPackage,
    isInstallingAgent,
    installError: installPackageError || installAgentError,

    // Computed values
    upgradeCount: checkResult?.upgradeCount || 0,
    hasUpgrades: (checkResult?.upgradeCount || 0) > 0,
    applicableUpgrades,
    featureCards,
    hasConflicts: conflictInfo.hasConflicts,
    conflictCount: conflictInfo.conflictCount,
  };
}
