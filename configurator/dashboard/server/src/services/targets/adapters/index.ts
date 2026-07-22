// SPDX-License-Identifier: MIT
/**
 * Target adapter registry.
 *
 * A target has a *descriptor* (target-layout.ts) as soon as its paths are
 * known, but an *adapter* only once dev-suite can actually write its formats.
 * `isImplemented()` in target-layout.ts gates the UI on the same fact, so the
 * two must stay in step: adding an adapter here means adding its id there.
 */

import type { TargetId } from '../target-layout.js';
import type { TargetAdapter } from '../target-adapter.js';
import { ClaudeCodeAdapter } from './claude-code.adapter.js';
import { CopilotAdapter } from './copilot.adapter.js';
import { CursorAdapter } from './cursor.adapter.js';

const ADAPTERS: Partial<Record<TargetId, TargetAdapter>> = {
  'claude-code': new ClaudeCodeAdapter(),
  copilot: new CopilotAdapter(),
  cursor: new CursorAdapter(),
};

/**
 * Resolve the adapter for a target.
 * @throws {Error} when the target has no adapter yet.
 */
export function getAdapter(target: TargetId): TargetAdapter {
  const adapter = ADAPTERS[target];
  if (!adapter) {
    throw new Error(`No adapter implemented for target: ${target}`);
  }
  return adapter;
}

/** Targets that can currently be written. */
export function listAdapterTargets(): TargetId[] {
  return Object.keys(ADAPTERS) as TargetId[];
}

export { ClaudeCodeAdapter, CopilotAdapter, CursorAdapter };
