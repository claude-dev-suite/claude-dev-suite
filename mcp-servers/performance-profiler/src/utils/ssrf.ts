// SPDX-License-Identifier: MIT
/**
 * SSRF protection for the performance-profiler MCP server.
 *
 * The implementation now lives in `@dev-suite/shared`; this module only maps
 * the server's own escape-hatch env var onto the shared flag. Keeping the env
 * name here means one server's opt-in can never widen another's policy.
 *
 * Policy summary (see the shared module for the full ranges):
 *  - `localhost` is allowed — profiling local endpoints is the primary use case.
 *  - 169.254.0.0/16 (cloud metadata) is ALWAYS blocked.
 *  - Other private/loopback/ULA/link-local ranges are blocked unless
 *    PERF_PROFILER_ALLOW_PRIVATE_URLS=1.
 *  - Callers MUST re-validate each redirect Location (see http-client.ts).
 */

import { validateUrl as validateUrlShared } from '@dev-suite/shared';

/** True when the operator opted into private-range profiling. */
function allowPrivate(): boolean {
  return process.env['PERF_PROFILER_ALLOW_PRIVATE_URLS'] === '1';
}

/** Validate a URL for SSRF risks. Throws when the URL is blocked. */
export async function validateUrl(rawUrl: string): Promise<void> {
  return validateUrlShared(rawUrl, { allowPrivate: allowPrivate() });
}
