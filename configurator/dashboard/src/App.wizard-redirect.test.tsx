// SPDX-License-Identifier: MIT
/**
 * Regression test for Tier 0 #6 of the 2026-08 audit.
 *
 * `checkInstalled` listed `currentPanel` among its effect dependencies and
 * redirected `wizard → orchestrator` whenever the project was installed. Any
 * navigation *back* to the wizard therefore re-ran the effect, matched the
 * condition again, and bounced the user straight out. On an installed project
 * the Setup Wizard tab was unreachable — which is the only route to adding a
 * second assistant target, so the multi-assistant feature had no entry point
 * after the first install.
 *
 * The redirect is now latched to fire at most once per session.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { App } from './App';
import { useProjectStore } from './stores/project.store';
import { useUIStore } from './stores/ui.store';

function mockApi(installed: boolean) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/installed-components')) {
      return Promise.resolve({ ok: true, json: async () => ({ installed }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ status: 'ok' }) });
  }) as unknown as typeof fetch;
}

describe('App — Setup Wizard stays reachable after installation', () => {
  beforeEach(() => {
    useProjectStore.setState({ projectPath: '/tmp/project', isInstalled: false });
    useUIStore.setState({ currentPanel: 'wizard' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves the wizard for the orchestrator once, on first load', async () => {
    mockApi(true);
    render(<App />);

    await waitFor(() => {
      expect(useUIStore.getState().currentPanel).toBe('orchestrator');
    });
  });

  it('does not bounce the user back when they return to the wizard', async () => {
    mockApi(true);
    render(<App />);

    // First load moves us off the wizard.
    await waitFor(() => {
      expect(useUIStore.getState().currentPanel).toBe('orchestrator');
    });

    // The user picks "Setup Wizard" from the header again.
    act(() => {
      useUIStore.getState().setPanel('wizard');
    });

    // It must stick. Before the fix the effect re-ran on the `currentPanel`
    // change and immediately reset the panel to 'orchestrator'.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(useUIStore.getState().currentPanel).toBe('wizard');
  });

  it('still redirects an uninstalled project to the wizard', async () => {
    mockApi(false);
    useUIStore.setState({ currentPanel: 'orchestrator' });

    render(<App />);

    await waitFor(() => {
      expect(useUIStore.getState().currentPanel).toBe('wizard');
    });
  });
});
