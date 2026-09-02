// SPDX-License-Identifier: MIT
/**
 * Helpers shared across dev-suite MCP servers.
 *
 * This package previously existed as `dist/` output with no source and no
 * consumers, which is why guards it was meant to hold ended up duplicated
 * across servers instead — three SSRF implementations of unequal strength and
 * five copies of the file-path check.
 *
 * Consumed as source: `exports.types` points at `src/`, and each server's
 * bundler inlines it, so there is no separate build step to keep in order.
 */

export { validateUrl, type SsrfOptions } from './ssrf.js';
export { validateFilePath, assertWithinRoot } from './file-path.js';
export { SingleFlight } from './single-flight.js';
export { Semaphore } from './semaphore.js';
