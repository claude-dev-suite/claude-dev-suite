// SPDX-License-Identifier: MIT
/**
 * Tests for the concurrency primitives that keep an MCP server from doing the
 * same expensive thing once per concurrent subagent.
 */

import { describe, it, expect, vi } from 'vitest';
import { SingleFlight } from '../src/single-flight.js';
import { Semaphore } from '../src/semaphore.js';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SingleFlight', () => {
  it('runs the work once for N concurrent callers on the same key', async () => {
    const sf = new SingleFlight<string>();
    const work = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 'value';
    });

    const results = await Promise.all(
      Array.from({ length: 16 }, () => sf.run('k', work))
    );

    expect(work).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(16);
    expect(new Set(results)).toEqual(new Set(['value']));
  });

  it('keys are independent', async () => {
    const sf = new SingleFlight<string>();
    const work = vi.fn(async (k: string) => k);

    const results = await Promise.all(
      ['a', 'b', 'c'].map((k) => sf.run(k, () => work(k)))
    );

    expect(work).toHaveBeenCalledTimes(3);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  it('releases the key once settled, so a later call runs again', async () => {
    const sf = new SingleFlight<number>();
    let calls = 0;
    const work = async () => ++calls;

    expect(await sf.run('k', work)).toBe(1);
    expect(sf.has('k')).toBe(false);
    expect(await sf.run('k', work)).toBe(2);
  });

  it('propagates a rejection to every waiter and frees the key', async () => {
    const sf = new SingleFlight<never>();
    const d = deferred<never>();
    const work = vi.fn(() => d.promise);

    const waiters = Array.from({ length: 5 }, () => sf.run('k', work));
    d.reject(new Error('boom'));

    const settled = await Promise.allSettled(waiters);
    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
    expect(sf.has('k')).toBe(false);
  });

  it('turns a synchronous throw into a rejection without trapping the key', async () => {
    const sf = new SingleFlight<number>();
    await expect(
      sf.run('k', () => {
        throw new Error('sync');
      })
    ).rejects.toThrow('sync');
    expect(sf.has('k')).toBe(false);
    expect(await sf.run('k', async () => 42)).toBe(42);
  });

  it('reports the number of distinct in-flight keys', async () => {
    const sf = new SingleFlight<void>();
    const d = deferred<void>();
    void sf.run('a', () => d.promise);
    void sf.run('a', () => d.promise);
    void sf.run('b', () => d.promise);
    expect(sf.size).toBe(2);
    d.resolve();
    await Promise.resolve();
  });
});

describe('Semaphore', () => {
  it('never exceeds the configured concurrency', async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 16 }, () =>
        sem.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 2));
          active--;
        })
      )
    );

    expect(peak).toBeLessThanOrEqual(2);
    expect(sem.free).toBe(2);
  });

  it('releases the slot when the task throws', async () => {
    const sem = new Semaphore(1);
    await expect(
      sem.run(async () => {
        throw new Error('nope');
      })
    ).rejects.toThrow('nope');
    expect(sem.free).toBe(1);
    await expect(sem.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('ignores a double release so the limit cannot inflate', async () => {
    const sem = new Semaphore(1);
    const release = await sem.acquire();
    release();
    release();
    expect(sem.free).toBe(1);
  });

  it('rejects a non-positive limit', () => {
    expect(() => new Semaphore(0)).toThrow();
    expect(() => new Semaphore(1.5)).toThrow();
  });
});
