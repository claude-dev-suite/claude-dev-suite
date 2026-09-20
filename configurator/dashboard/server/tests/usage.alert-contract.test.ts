/**
 * The alert-threshold contract, pinned from the server side.
 *
 * The UI offered `daily_cost_usd` / `monthly_cost_usd` and the operators
 * `lt` / `lte`. `AlertThresholdSchema` accepts `daily_cost` / `monthly_cost`
 * and only `gt` / `gte`, so every cost threshold 400'd at the validation
 * middleware — and because the whole config is one request, it took the user's
 * token thresholds and polling interval down with it. Token thresholds saved
 * fine, which made the failure look like user error.
 *
 * The second half was worse: even server-side, `metricValues[threshold.metric]`
 * for an unknown key yields `undefined`, `?? 0` makes it `0`, and `0 > limit`
 * is never true. A "$50/day" alert could not have fired even if it had saved.
 *
 * These tests assert the three server-side definitions agree with each other.
 * The client's union was corrected to match; nothing here can see the client,
 * so the real guard is that these names are now stated in exactly one place per
 * side and both are covered.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { AlertThresholdSchema } from '../src/validation/schemas.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

const METRICS = ['daily_cost', 'monthly_cost', 'daily_tokens', 'monthly_tokens'] as const;

const valid = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Daily spend',
  metric: 'daily_cost',
  operator: 'gt',
  value: 50,
  severity: 'warning',
  enabled: true,
  ...over,
});

describe('AlertThresholdSchema', () => {
  it.each(METRICS)('accepts the %s metric', metric => {
    expect(AlertThresholdSchema.safeParse(valid({ metric })).success).toBe(true);
  });

  it.each(['daily_cost_usd', 'monthly_cost_usd'])('rejects the legacy %s name', metric => {
    // Kept as a test rather than a migration: these could never have been
    // persisted, because the schema has always refused them.
    expect(AlertThresholdSchema.safeParse(valid({ metric })).success).toBe(false);
  });

  it.each(['gt', 'gte'])('accepts the %s operator', operator => {
    expect(AlertThresholdSchema.safeParse(valid({ operator })).success).toBe(true);
  });

  it.each(['lt', 'lte'])('rejects %s, which the evaluator cannot express', operator => {
    expect(AlertThresholdSchema.safeParse(valid({ operator })).success).toBe(false);
  });
});

describe('the three server-side definitions agree', () => {
  const usageTypes = fs.readFileSync(path.join(SRC, 'types/usage.ts'), 'utf-8');
  const usageService = fs.readFileSync(path.join(SRC, 'services/usage.service.ts'), 'utf-8');

  it.each(METRICS)('%s is in the type, the schema and the metricValues map', metric => {
    expect(usageTypes).toContain(`'${metric}'`);
    expect(AlertThresholdSchema.safeParse(valid({ metric })).success).toBe(true);
    // The evaluator builds `metricValues` as a Record keyed by the metric union;
    // a key missing from it resolves to 0 through `?? 0` and can never trigger.
    expect(usageService).toMatch(new RegExp(`\\b${metric}\\s*:`));
  });

  it('neither side still offers an operator the evaluator cannot implement', () => {
    // `operator === 'gt' ? > : >=` — a binary choice. Anything else silently
    // means `>=`.
    expect(usageService).toContain("threshold.operator === 'gt'");
    for (const bad of ["'lt'", "'lte'"]) {
      expect(usageTypes).not.toContain(bad);
    }
  });
});
