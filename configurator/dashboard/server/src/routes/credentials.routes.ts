// SPDX-License-Identifier: MIT
/**
 * Anthropic Runtime Credential API Routes
 *
 * Set, inspect, clear, and verify the credential the Agent SDK uses to run the
 * model (Orchestrator chat + jobs).  This is deliberately separate from
 * `/api/usage/config`, which holds the per-project Admin API key used only for
 * usage and cost reporting — the two are not interchangeable.
 *
 * SECURITY: no endpoint here ever returns the secret.  Reads return the masked
 * `CredentialStatus`; writes echo the same masked status back.
 */

import { Router, type Request, type Response } from 'express';
import { credentialsService, CredentialValidationError } from '../services/credentials.service.js';
import { getLogger } from '../utils/logger.js';
import { validateBody } from '../middleware/validateRequest.js';
import { SaveCredentialRequestSchema, VerifyCredentialRequestSchema } from '../validation/schemas.js';
import type { CredentialKind } from '../types/credentials.js';

const logger = getLogger('credentials-routes');
export const credentialsRoutes = Router();

/**
 * Log an error without its message when the message could plausibly quote the
 * submitted secret back.  Validation errors are authored in this codebase and
 * never interpolate the value, so those stay verbatim.
 */
function logSafely(context: string, err: unknown): void {
  if (err instanceof CredentialValidationError) {
    logger.warn(context, { error: err.message });
    return;
  }
  logger.error(context, { error: err instanceof Error ? err.name : 'UnknownError' });
}

/**
 * GET /api/credentials
 *
 * Masked description of the credential currently in effect: whether one is
 * configured, whether it came from the store or the ambient environment, which
 * env var it maps to, and a preview.  Never the secret itself.
 */
credentialsRoutes.get('/credentials', (_req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: credentialsService.getStatus() });
  } catch (err) {
    logSafely('Failed to read credential status', err);
    return res.status(500).json({ success: false, error: 'Failed to read credential status' });
  }
});

/**
 * PUT /api/credentials
 *
 * Store the credential the orchestrator should use, replacing any previous one.
 *
 * Body: { credential: string, kind?: 'api_key' | 'oauth_token' | 'auto' }
 *
 * `kind` defaults to `'auto'`, which classifies by prefix (`sk-ant-api…` vs
 * `sk-ant-oat…`).  An unrecognised prefix is a 400 asking for an explicit kind
 * rather than a guess — guessing wrong sets the wrong env var and surfaces
 * later as an opaque auth failure.
 */
credentialsRoutes.put(
  '/credentials',
  validateBody(SaveCredentialRequestSchema),
  (req: Request, res: Response) => {
    try {
      const { credential, kind } = req.body as {
        credential: string;
        kind?: CredentialKind | 'auto';
      };

      const status = credentialsService.save(credential, kind);
      return res.json({ success: true, data: status });
    } catch (err) {
      logSafely('Failed to save credential', err);

      if (err instanceof CredentialValidationError) {
        return res.status(400).json({ success: false, error: err.message });
      }

      return res.status(500).json({ success: false, error: 'Failed to save credential' });
    }
  },
);

/**
 * DELETE /api/credentials
 *
 * Remove the stored credential.  The orchestrator falls back to the ambient
 * environment (or to whatever `claude login` left on disk), which the returned
 * status reports.
 */
credentialsRoutes.delete('/credentials', (_req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: credentialsService.clear() });
  } catch (err) {
    logSafely('Failed to clear credential', err);
    return res.status(500).json({ success: false, error: 'Failed to clear credential' });
  }
});

/**
 * POST /api/credentials/verify
 *
 * Probe a credential against a read-only Anthropic endpoint.  With no body, the
 * credential currently in effect is tested, so the user can tell a bad key from
 * a failing chat turn without saving anything first.
 *
 * Body: { credential?: string, kind?: 'api_key' | 'oauth_token' | 'auto' }
 */
credentialsRoutes.post(
  '/credentials/verify',
  validateBody(VerifyCredentialRequestSchema),
  async (req: Request, res: Response) => {
    try {
      const { credential, kind } = (req.body ?? {}) as {
        credential?: string;
        kind?: CredentialKind | 'auto';
      };

      const result = await credentialsService.verify(credential, kind);
      return res.json({ success: true, data: result });
    } catch (err) {
      logSafely('Failed to verify credential', err);

      if (err instanceof CredentialValidationError) {
        return res.status(400).json({ success: false, error: err.message });
      }

      return res.status(500).json({ success: false, error: 'Failed to verify credential' });
    }
  },
);
