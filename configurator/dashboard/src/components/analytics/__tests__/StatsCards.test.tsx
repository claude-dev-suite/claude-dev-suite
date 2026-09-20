/**
 * The Analytics stat cards, against the shape the server actually sends.
 *
 * Both bugs these cover were silent: the "Total Requests" card read a field name
 * (`totalRequests`) the server has never emitted and rendered blank, and the
 * success rate was multiplied by 100 a second time — the server already returns
 * a percentage — so 92% rendered as "9200.0%" with a progress bar at
 * `width: 9200%` and colour thresholds (`>= 0.9`) that were always true.
 *
 * The fixture below is deliberately the server's shape, taken from
 * `analytics.service.ts`'s return: `totalCalls`, and `successRate` already
 * `Math.round((successCount / entries.length) * 100)`.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsCards } from '../StatsCards';
import type { KBUsageStats } from '@/types';

const stats = (over: Partial<KBUsageStats> = {}): KBUsageStats => ({
  totalCalls: 137,
  successRate: 92, // percentage, as the server sends it
  byTechnology: {},
  byTool: {},
  timeline: [],
  ...over,
});

describe('StatsCards', () => {
  it('shows the request total the server actually sends', () => {
    render(<StatsCards stats={stats()} />);
    expect(screen.getByText('137')).toBeInTheDocument();
  });

  it('renders the success rate as a percentage, not a percentage of a percentage', () => {
    render(<StatsCards stats={stats({ successRate: 92 })} />);
    expect(screen.getByText('92.0%')).toBeInTheDocument();
    expect(screen.queryByText('9200.0%')).not.toBeInTheDocument();
  });

  it('keeps the progress bar inside 100%', () => {
    const { container } = render(<StatsCards stats={stats({ successRate: 92 })} />);
    const widths = [...container.querySelectorAll<HTMLElement>('[style*="width"]')].map(
      el => el.style.width
    );
    expect(widths).toContain('92%');
    for (const w of widths) {
      const n = Number.parseFloat(w);
      if (!Number.isNaN(n) && w.endsWith('%')) expect(n).toBeLessThanOrEqual(100);
    }
  });

  it('a zero success rate is not styled as a pass', () => {
    // The thresholds compared a 0-100 value against 0.9, so every rate — including
    // a genuinely bad one — took the "good" branch.
    const { container } = render(<StatsCards stats={stats({ successRate: 0 })} />);
    expect(screen.getByText('0.0%')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/text-green|bg-green/);
  });

  it('a high rate is styled as a pass', () => {
    const { container } = render(<StatsCards stats={stats({ successRate: 97 })} />);
    expect(container.innerHTML).toMatch(/green/);
  });
});
