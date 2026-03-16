// SPDX-License-Identifier: MIT
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PermissionDialog } from '../PermissionDialog';
import type { PermissionRequest, RiskLevel } from '../PermissionDialog';

function makeRequest(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    requestId: 'req-test-001',
    jobId: 'job-test-001',
    toolName: 'Bash',
    input: { command: 'rm -rf /tmp/build' },
    risk: 'high',
    category: 'Destructive shell command',
    description: 'rm -rf /tmp/build',
    timeoutMs: 30000,
    receivedAt: Date.now(),
    ...overrides,
  };
}

describe('PermissionDialog', () => {
  // ─── Rendering ────────────────────────────────────────────────────────────

  describe('Rendering basics', () => {
    it('renders with the correct tool name', () => {
      const onDecision = vi.fn();
      render(<PermissionDialog request={makeRequest({ toolName: 'Bash' })} onDecision={onDecision} />);
      expect(screen.getByText('Bash')).toBeInTheDocument();
    });

    it('renders with a different tool name (Write)', () => {
      const onDecision = vi.fn();
      render(
        <PermissionDialog
          request={makeRequest({ toolName: 'Write', risk: 'critical' })}
          onDecision={onDecision}
        />
      );
      expect(screen.getByText('Write')).toBeInTheDocument();
    });

    it('shows the "Permission Required" heading', () => {
      render(<PermissionDialog request={makeRequest()} onDecision={vi.fn()} />);
      expect(screen.getByText('Permission Required')).toBeInTheDocument();
    });

    it('shows the category text', () => {
      render(
        <PermissionDialog
          request={makeRequest({ category: 'Destructive shell command' })}
          onDecision={vi.fn()}
        />
      );
      expect(screen.getByText('Destructive shell command')).toBeInTheDocument();
    });

    it('shows the description text', () => {
      render(
        <PermissionDialog
          request={makeRequest({ description: 'rm -rf /tmp/build' })}
          onDecision={vi.fn()}
        />
      );
      expect(screen.getByText('rm -rf /tmp/build')).toBeInTheDocument();
    });

    it('has data-testid="permission-dialog" on root element', () => {
      const { container } = render(
        <PermissionDialog request={makeRequest()} onDecision={vi.fn()} />
      );
      expect(container.querySelector('[data-testid="permission-dialog"]')).toBeInTheDocument();
    });

    it('has data-testid="permission-allow" button', () => {
      render(<PermissionDialog request={makeRequest()} onDecision={vi.fn()} />);
      expect(screen.getByTestId('permission-allow')).toBeInTheDocument();
    });

    it('has data-testid="permission-deny" button', () => {
      render(<PermissionDialog request={makeRequest()} onDecision={vi.fn()} />);
      expect(screen.getByTestId('permission-deny')).toBeInTheDocument();
    });

    it('deny button shows "Deny & Abort Job" text', () => {
      render(<PermissionDialog request={makeRequest()} onDecision={vi.fn()} />);
      expect(screen.getByTestId('permission-deny')).toHaveTextContent('Deny & Abort Job');
    });

    it('shows "Note: Denying will abort the entire job" warning text', () => {
      render(<PermissionDialog request={makeRequest()} onDecision={vi.fn()} />);
      expect(screen.getByText(/Note: Denying will abort the entire job/i)).toBeInTheDocument();
    });
  });

  // ─── Risk level badges and icons ──────────────────────────────────────────

  describe('Risk level badge and icon', () => {
    const riskCases: Array<{ risk: RiskLevel; icon: string; badgeText: string }> = [
      { risk: 'critical', icon: '🚨', badgeText: 'critical' },
      { risk: 'high',     icon: '🔶', badgeText: 'high' },
      { risk: 'medium',   icon: '⚠️', badgeText: 'medium' },
      { risk: 'low',      icon: 'ℹ️', badgeText: 'low' },
    ];

    for (const { risk, icon, badgeText } of riskCases) {
      it(`shows correct icon "${icon}" for ${risk} risk`, () => {
        render(<PermissionDialog request={makeRequest({ risk })} onDecision={vi.fn()} />);
        expect(screen.getByText(icon)).toBeInTheDocument();
      });

      it(`shows risk level badge "${badgeText}" for ${risk} risk`, () => {
        render(<PermissionDialog request={makeRequest({ risk })} onDecision={vi.fn()} />);
        // The badge text is the risk level in uppercase (CSS) — match case-insensitively
        const badges = screen.getAllByText(new RegExp(`^${badgeText}$`, 'i'));
        expect(badges.length).toBeGreaterThan(0);
      });
    }
  });

  // ─── Button interactions ───────────────────────────────────────────────────

  describe('Button interactions', () => {
    it('clicking Allow calls onDecision with (requestId, "allow")', () => {
      const onDecision = vi.fn();
      render(
        <PermissionDialog
          request={makeRequest({ requestId: 'req-allow-click' })}
          onDecision={onDecision}
        />
      );

      fireEvent.click(screen.getByTestId('permission-allow'));
      expect(onDecision).toHaveBeenCalledWith('req-allow-click', 'allow');
    });

    it('clicking Deny calls onDecision with (requestId, "deny")', () => {
      const onDecision = vi.fn();
      render(
        <PermissionDialog
          request={makeRequest({ requestId: 'req-deny-click' })}
          onDecision={onDecision}
        />
      );

      fireEvent.click(screen.getByTestId('permission-deny'));
      expect(onDecision).toHaveBeenCalledWith('req-deny-click', 'deny');
    });

    it('onDecision is called exactly once when Allow is clicked', () => {
      const onDecision = vi.fn();
      render(<PermissionDialog request={makeRequest()} onDecision={onDecision} />);

      fireEvent.click(screen.getByTestId('permission-allow'));
      expect(onDecision).toHaveBeenCalledTimes(1);
    });

    it('onDecision is called exactly once when Deny is clicked', () => {
      const onDecision = vi.fn();
      render(<PermissionDialog request={makeRequest()} onDecision={onDecision} />);

      fireEvent.click(screen.getByTestId('permission-deny'));
      expect(onDecision).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Countdown timer ──────────────────────────────────────────────────────

  describe('Countdown timer', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows a countdown number followed by "s"', () => {
      const receivedAt = Date.now();
      render(
        <PermissionDialog
          request={makeRequest({ timeoutMs: 30000, receivedAt })}
          onDecision={vi.fn()}
        />
      );

      // Allow text should contain a number followed by 's', e.g. "Allow (30s)"
      const allowBtn = screen.getByTestId('permission-allow');
      expect(allowBtn.textContent).toMatch(/\d+s/);
    });

    it('countdown decrements as fake time advances', () => {
      const receivedAt = Date.now();
      const onDecision = vi.fn();
      render(
        <PermissionDialog
          request={makeRequest({ timeoutMs: 10000, receivedAt })}
          onDecision={onDecision}
        />
      );

      // Initial state: ~10s
      const allowBtnBefore = screen.getByTestId('permission-allow');
      const initialMatch = allowBtnBefore.textContent?.match(/(\d+)s/);
      const initialSeconds = initialMatch ? parseInt(initialMatch[1]!, 10) : -1;
      expect(initialSeconds).toBeGreaterThan(0);

      // Advance 3 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      const allowBtnAfter = screen.getByTestId('permission-allow');
      const afterMatch = allowBtnAfter.textContent?.match(/(\d+)s/);
      const afterSeconds = afterMatch ? parseInt(afterMatch[1]!, 10) : -1;

      // After 3 seconds, should be less than initial
      expect(afterSeconds).toBeLessThan(initialSeconds);
    });

    it('auto-calls onDecision with "allow" when timer reaches 0', () => {
      const receivedAt = Date.now();
      const onDecision = vi.fn();
      render(
        <PermissionDialog
          request={makeRequest({ timeoutMs: 2000, receivedAt })}
          onDecision={onDecision}
        />
      );

      // Advance past the timeout
      act(() => {
        vi.advanceTimersByTime(2500);
      });

      expect(onDecision).toHaveBeenCalledWith(expect.any(String), 'allow');
    });

    it('displays the remaining seconds in the note text', () => {
      const receivedAt = Date.now();
      render(
        <PermissionDialog
          request={makeRequest({ timeoutMs: 20000, receivedAt })}
          onDecision={vi.fn()}
        />
      );

      // The note should mention the remaining time
      const noteText = screen.getByText(/Auto-allowing in/i);
      expect(noteText).toBeInTheDocument();
    });
  });
});
