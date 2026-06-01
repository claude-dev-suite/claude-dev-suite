// SPDX-License-Identifier: MIT
/**
 * Release Check Hook
 *
 * Asks the backend whether a newer dev-suite GitHub release exists than the
 * running version. Supports per-version dismissal (persisted in localStorage)
 * so the alert doesn't nag after the user acknowledges a given version.
 */

import { useState, useCallback, useMemo } from 'react';
import { useApi, invalidateCache } from './useApi';
import type { ReleaseCheckResult } from '@/types';

const DISMISS_KEY = 'devsuite.releaseCheck.dismissedVersion';

export interface UseReleaseCheckResult {
  result: ReleaseCheckResult | null;
  loading: boolean;
  error: string | null;
  /** True when an update is available AND not dismissed for that version. */
  showAlert: boolean;
  dismiss: () => void;
  recheck: () => Promise<void>;
}

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function useReleaseCheck(): UseReleaseCheckResult {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(readDismissed());

  const { data, loading, error, refetch } = useApi<ReleaseCheckResult>('/api/release-check');

  const dismiss = useCallback(() => {
    const v = data?.latestVersion;
    if (!v) return;
    try {
      localStorage.setItem(DISMISS_KEY, v);
    } catch {
      // ignore storage errors
    }
    setDismissedVersion(v);
  }, [data?.latestVersion]);

  const recheck = useCallback(async () => {
    invalidateCache('/api/release-check');
    await refetch();
  }, [refetch]);

  const showAlert = useMemo(() => {
    if (!data?.updateAvailable || !data.latestVersion) return false;
    return data.latestVersion !== dismissedVersion;
  }, [data?.updateAvailable, data?.latestVersion, dismissedVersion]);

  return {
    result: data ?? null,
    loading,
    error,
    showAlert,
    dismiss,
    recheck,
  };
}
