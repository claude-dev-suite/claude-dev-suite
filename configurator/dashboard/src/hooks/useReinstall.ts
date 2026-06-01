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

  const reinstall = useCallback(
    async (createBackup = true): Promise<ReinstallExecuteResult | null> => {
      logger.info('Executing reinstall', { projectPath, createBackup });
      resetExecute();
      setExecuteResult(null);

      const result = await executeMutate({
        projectPath,
        resolutions: Object.keys(resolutions).length > 0 ? resolutions : undefined,
        createBackup,
      });

      if (result) {
        setExecuteResult(result);
        // Refresh dependent views.
        invalidateCache('/api/reinstall/preview');
        invalidateCache('/api/install-status');
        await refetchPreview();
      }
      return result;
    },
    [projectPath, resolutions, executeMutate, resetExecute, refetchPreview]
  );

  return {
    previewResult: previewResult ?? null,
    isPreviewing,
    previewError,
    refreshPreview,
    executeResult,
    isExecuting,
    executeError,
    resolutions,
    setResolution,
    resetResolutions,
    reinstall,
  };
}
