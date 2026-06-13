// SPDX-License-Identifier: MIT
/**
 * Regression tests for docker-manager `tail` bounds (LOW severity finding).
 * Verifies that ContainerActionSchema enforces min=1, max=10000.
 */

import { describe, it, expect } from 'vitest';
import { ContainerActionSchema } from '../src/handlers/types.js';

describe('ContainerActionSchema — tail bounds', () => {
  it('accepts default tail value (100)', () => {
    const result = ContainerActionSchema.safeParse({
      container: 'my-app',
      action: 'logs',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tail).toBe(100);
    }
  });

  it('accepts tail=1 (minimum)', () => {
    const result = ContainerActionSchema.safeParse({
      container: 'my-app',
      action: 'logs',
      tail: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts tail=10000 (maximum)', () => {
    const result = ContainerActionSchema.safeParse({
      container: 'my-app',
      action: 'logs',
      tail: 10000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects tail=0 (below minimum)', () => {
    const result = ContainerActionSchema.safeParse({
      container: 'my-app',
      action: 'logs',
      tail: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects tail=10001 (above maximum)', () => {
    const result = ContainerActionSchema.safeParse({
      container: 'my-app',
      action: 'logs',
      tail: 10001,
    });
    expect(result.success).toBe(false);
  });

  it('rejects tail=999999999 (far above maximum)', () => {
    const result = ContainerActionSchema.safeParse({
      container: 'my-app',
      action: 'logs',
      tail: 999999999,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer tail (float)', () => {
    const result = ContainerActionSchema.safeParse({
      container: 'my-app',
      action: 'logs',
      tail: 50.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative tail', () => {
    const result = ContainerActionSchema.safeParse({
      container: 'my-app',
      action: 'logs',
      tail: -100,
    });
    expect(result.success).toBe(false);
  });
});
