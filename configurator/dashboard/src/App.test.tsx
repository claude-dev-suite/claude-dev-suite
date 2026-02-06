// SPDX-License-Identifier: MIT
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

// Mock fetch for health check
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: 'ok' }),
  });
});

describe('App', () => {
  it('renders the dashboard header', () => {
    render(<App />);
    expect(screen.getByText('Dev-Suite')).toBeInTheDocument();
    expect(screen.getByText('Dashboard v2')).toBeInTheDocument();
  });

  it('shows setup wizard when not installed', () => {
    render(<App />);
    // Setup Wizard tab should be visible when not installed
    expect(screen.getByText('Setup Wizard')).toBeInTheDocument();
  });

  it('shows wizard steps in sidebar', () => {
    render(<App />);
    expect(screen.getByText('Setup Steps')).toBeInTheDocument();
    expect(screen.getByText('Detection')).toBeInTheDocument();
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('MCP Servers')).toBeInTheDocument();
    expect(screen.getByText('Environment')).toBeInTheDocument();
    expect(screen.getByText('Install')).toBeInTheDocument();
  });

  it('shows tool window bar buttons', () => {
    render(<App />);
    // Tool window buttons (Git, Manage, Analytics) should be in the sidebar
    expect(screen.getByRole('button', { name: /git/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /analytics/i })).toBeInTheDocument();
  });
});
