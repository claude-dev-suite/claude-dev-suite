// SPDX-License-Identifier: MIT
/**
 * Canonical wizard step list — the single source of truth for step ids, labels
 * and the total count.
 *
 * The sidebar renders from this, and `WizardContainer` / `ui.store` derive their
 * navigation bounds from its length, so inserting a step is one edit here rather
 * than a scattered set of magic numbers. (Before this existed, the sidebar was
 * silently a step behind the container.)
 */
export interface WizardStepDef {
  id: number;
  label: string;
  description: string;
}

export const WIZARD_STEPS: readonly WizardStepDef[] = [
  { id: 1, label: 'Detection', description: 'Analyze project' },
  { id: 2, label: 'Agents', description: 'Select agents' },
  { id: 3, label: 'MCP Servers', description: 'Configure tools' },
  { id: 4, label: 'Environment', description: 'Set variables' },
  { id: 5, label: 'Rules', description: 'Project guidelines' },
  { id: 6, label: 'Assistants', description: 'Target editors' },
  { id: 7, label: 'Install', description: 'Finalize setup' },
];

/** Highest step number — the install step. */
export const LAST_WIZARD_STEP = WIZARD_STEPS.length;
