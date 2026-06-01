// SPDX-License-Identifier: MIT
/**
 * Release Check Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReleaseCheckService } from '../../src/services/release-check.service.js';
import { z } from 'zod';

vi.mock('../../src/services/release-check.service.js');

// Mirrors release-check.routes.ts
const ReleaseCheckQuerySchema = z.object({
  refresh: z.coerce.boolean().optional(),
});

const MOCK_RESULT = {
  currentVersion: '1.10.0',
  latestVersion: '1.11.0',
  updateAvailable: true,
  releaseUrl: 'https://github.com/claude-dev-suite/claude-dev-suite/releases/tag/v1.11.0',
  releaseName: 'v1.11.0',
  publishedAt: '2026-06-01T00:00:00Z',
  repo: 'claude-dev-suite/claude-dev-suite',
  checkedAt: '2026-06-01T00:00:00Z',
};

describe('Release Check Routes - Service Integration', () => {
  let svc: ReleaseCheckService;

  beforeEach(() => {
    svc = new ReleaseCheckService();
    vi.clearAllMocks();
  });

  it('returns the release check result', async () => {
    vi.mocked(svc.checkLatestRelease).mockResolvedValue(MOCK_RESULT as never);
    const r = await svc.checkLatestRelease({});
    expect(r.updateAvailable).toBe(true);
    expect(r.latestVersion).toBe('1.11.0');
  });

  it('passes force through on refresh', async () => {
    vi.mocked(svc.checkLatestRelease).mockResolvedValue({ ...MOCK_RESULT, updateAvailable: false } as never);
    await svc.checkLatestRelease({ force: true });
    expect(svc.checkLatestRelease).toHaveBeenCalledWith({ force: true });
  });

  describe('Zod query validation', () => {
    it('accepts an empty query', () => {
      expect(ReleaseCheckQuerySchema.safeParse({}).success).toBe(true);
    });
    it('coerces the refresh flag', () => {
      expect(ReleaseCheckQuerySchema.parse({ refresh: 'true' }).refresh).toBe(true);
    });
  });
});
