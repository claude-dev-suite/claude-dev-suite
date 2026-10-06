// SPDX-License-Identifier: MIT
/**
 * Library entry point: the services the wizard drives, without the server.
 *
 * `index.ts` starts the HTTP and WebSocket servers as a side effect of being
 * imported, so a command-line install could not reach the services through the
 * package's main entry. This module only re-exports; importing it starts
 * nothing. Set `DEV_SUITE_HEADLESS=1` before importing it to keep log output
 * off stdout (see `utils/logger.ts`), and `DEV_SUITE_DIR` to say where the
 * catalog — agents/, skills/, mcp-servers/, rules/, commands/, templates/ —
 * lives.
 */

export { DetectionService } from './services/detection.service.js';
export { AgentsService } from './services/agents.service.js';
export { RulesService, type RuleMetadata } from './services/rules.service.js';
export {
  AssistantDetectionService,
  type DetectedAssistant,
} from './services/detection/assistant-detection.service.js';
export { InstallationService } from './services/installation.service.js';
export { ReinstallService } from './services/reinstall.service.js';
export {
  DEFAULT_TARGET,
  isImplemented,
  listImplementedTargets,
  type TargetId,
} from './services/targets/target-layout.js';
export { getDevSuiteDir } from './utils/dev-suite-dir.js';
export { DEV_SUITE_VERSION } from './utils/dev-suite-version.js';
export type {
  Agent,
  DetectionResult,
  InstallConfig,
  InstallManifest,
  McpServer,
} from './types.js';
