// SPDX-License-Identifier: MIT
/**
 * Reinstall Hook
 *
 * Drives the erase-and-replace reinstall flow: preview (diff + orphans),
 * per-file opt-out, and transactional execute.
 */

import { useState, useCallback } from 'react';
import { useApi, invalidateCache } from './useApi';
import { useMutation } from './useMutation';
import type {
  ReinstallPreviewResult,
  ReinstallExecuteResult,
  ReinstallExecuteRequest,
  ReinstallFileResolution,
} from '@/types';
import type { DriftReport } from '@/types/drift';
import { getLogger } from '@/utils/logger';

const logger = getLogger('useReinstall');

export interface UseReinstallOptions {
  projectPath: string;
  autoPreview?: boolean;
}

export interface UseReinstallResult {
  previewResult: ReinstallPreviewResult | null;
  isPreviewing: boolean;
  previewError: string | null;
  refreshPreview: () => Promise<void>;

  /**
   * Managed files that changed since dev-suite wrote them. Fetched separately
   * from the preview so a caller that only wants the banner (the Manage tab)
   * does not pay for a full reinstall preview.
   */
  driftReport: DriftReport | null;
  isScanningDrift: boolean;
  driftError: string | null;
  refreshDrift: () => Promise<void>;

  executeResult: ReinstallExecuteResult | null;
  isExecuting: boolean;
  executeError: string | null;

  resolutions: Record<string, ReinstallFileResolution>;
  setResolution: (path: string, resolution: ReinstallFileResolution) => void;
  resetResolutions: () => void;

  reinstall: (createBackup?: boolean) => Promise<ReinstallExecuteResult | null>;
}

export function useReinstall(options: UseReinstallOptions): UseReinstallResult {
  const { projectPath, autoPreview = true } = options;

  const [resolutions, setResolutions] = useState<Record<string, ReinstallFileResolution>>({});
  const [executeResult, setExecuteResult] = useState<ReinstallExecuteResult | null>(null);

  const {
    data: previewResult,
    loading: isPreviewing,
    error: previewError,
    refetch: refetchPreview,
  } = useApi<ReinstallPreviewResult>(
    `/api/reinstall/preview?path=${encodeURIComponent(projectPath)}`,
    { skip: !autoPreview || !projectPath }
  );

  const {
    data: driftReport,
    loading: isScanningDrift,
    error: driftError,
    refetch: refetchDrift,
  } = useApi<DriftReport>(
    `/api/reinstall/drift?path=${encodeURIComponent(projectPath)}`,
    { skip: !projectPath }
  );

  const {
    loading: isExecuting,
    error: executeError,
    mutate: executeMutate,
    reset: resetExecute,
  } = useMutation<ReinstallExecuteResult, ReinstallExecuteRequest>('/api/reinstall/execute');

  const setResolution = useCallback((path: string, resolution: ReinstallFileResolution) => {
    setResolutions(prev => ({ ...prev, [path]: resolution }));
  }, []);

  const resetResolutions = useCallback(() => setResolutions({}), []);

  const refreshPreview = useCallback(async () => {
    invalidateCache('/api/reinstall/preview');
    await refetchPreview();
  }, [refetchPreview]);

  const refreshDrift = useCallback(async () => {
    invalidateCache('/api/reinstall/drift');
    await refetchDrift();
  }, [refetchDrift]);

  const reinstall = useCallback(
    async (createBackup = true): Promise<ReinstallExecuteResult | null> => {
      logger.info('Executing reinstall', { projectPath, createBackup });
      resetExecute();
      setExecuteResult(null);

      // Files the user already adopted default to `promote` in the UI. That
      // default has to travel with the request: sending nothing means "no
      // resolution", and install() then replaces content the panel had just
      // shown as kept.
      const effective: Record<string, ReinstallFileResolution> = {};
      for (const file of previewResult?.modifiedManagedFiles ?? []) {
        if (file.acknowledged) effective[file.path] = 'promote';
      }
      Object.assign(effective, resolutions);

      const result = await executeMutate({
        projectPath,
        resolutions: Object.keys(effective).length > 0 ? effective : undefined,
        createBackup,
      });

      if (result) {
        setExecuteResult(result);
        // Refresh dependent views.
        invalidateCache('/api/reinstall/preview');
        invalidateCache('/api/reinstall/drift');
        invalidateCache('/api/install-status');
        await Promise.all([refetchPreview(), refetchDrift()]);
      }
      return result;
    },
    [projectPath, resolutions, previewResult, executeMutate, resetExecute, refetchPreview, refetchDrift]
  );

  return {
    previewResult: previewResult ?? null,
    isPreviewing,
    previewError,
    refreshPreview,
    driftReport: driftReport ?? null,
    isScanningDrift,
    driftError,
    refreshDrift,
    executeResult,
    isExecuting,
    executeError,
    resolutions,
    setResolution,
    resetResolutions,
    reinstall,
  };
}
