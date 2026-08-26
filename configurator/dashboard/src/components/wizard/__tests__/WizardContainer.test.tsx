// SPDX-License-Identifier: MIT
/**
 * Wizard step-registry and sidebar tests.
 *
 * These exercise the real step definitions (`WIZARD_STEPS`) and the real
 * `Sidebar` that renders them, rather than a hand-rolled mock of the wizard.
 * Step *navigation* (the ui.store clamps) is covered by ui.store.test.ts; here
 * we lock the step list and its rendering, which is where the "Assistants" step
 * and the previously-stale sidebar labels live.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '@/components/layout/Sidebar';
import { WIZARD_STEPS, LAST_WIZARD_STEP } from '@/components/wizard/steps';

describe('wizard step registry', () => {
  it('is the single source of truth for the seven steps, ending in Install', () => {
    expect(WIZARD_STEPS.map(s => s.label)).toEqual([
      'Detection',
      'Agents',
      'MCP Servers',
      'Environment',
      'Rules',
      'Assistants',
      'Install',
    ]);
    expect(LAST_WIZARD_STEP).toBe(7);
    expect(WIZARD_STEPS[LAST_WIZARD_STEP - 1].label).toBe('Install');
  });

  it('assigns contiguous 1-based ids', () => {
    expect(WIZARD_STEPS.map(s => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('wizard Sidebar', () => {
  it('renders every step label from the registry (no longer a step behind)', () => {
    render(<Sidebar mode="wizard" currentStep={1} />);
    for (const step of WIZARD_STEPS) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }
  });

  it('includes the Target Assistants step', () => {
    render(<Sidebar mode="wizard" currentStep={6} />);
    expect(screen.getByText('Assistants')).toBeInTheDocument();
  });
});
