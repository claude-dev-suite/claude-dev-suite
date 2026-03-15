// SPDX-License-Identifier: MIT
/**
 * Tests for useToast hook
 *
 * Tests toast notifications (success, error, warning, info, custom).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '../useToast';
import { useUIStore } from '@/stores/ui.store';

describe('useToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store before each test
    useUIStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show success toast', () => {
    const { result } = renderHook(() => useToast());

    let toastId: string;

    act(() => {
      toastId = result.current.success('Operation completed');
    });

    const toasts = useUIStore.getState().toasts;

    expect(toasts).toHaveLength(1);
    const firstToast = toasts[0];
    expect(firstToast).toMatchObject({
      type: 'success',
      message: 'Operation completed',
      duration: 5000,
    });
    expect(firstToast?.id).toBeDefined();
    expect(firstToast?.id).toBe(toastId!);
  });

  it('should show error toast with persistent duration', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.error('Something went wrong');
    });

    const toasts = useUIStore.getState().toasts;

    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      type: 'error',
      message: 'Something went wrong',
      duration: 0, // Errors persist by default
    });
  });

  it('should show warning toast with longer duration', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.warning('Please be careful');
    });

    const toasts = useUIStore.getState().toasts;

    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      type: 'warning',
      message: 'Please be careful',
      duration: 7000, // Warnings stay longer
    });
  });

  it('should show info toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.info('Loading data...');
    });

    const toasts = useUIStore.getState().toasts;

    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      type: 'info',
      message: 'Loading data...',
      duration: 5000,
    });
  });

  it('should show custom toast with custom type and duration', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.custom('success', 'Custom message', {
        duration: 3000,
      });
    });

    const toasts = useUIStore.getState().toasts;

    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      type: 'success',
      message: 'Custom message',
      duration: 3000,
    });
  });

  it('should include optional title', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success('Operation completed', {
        title: 'Success!',
      });
    });

    const toasts = useUIStore.getState().toasts;

    expect(toasts[0]).toMatchObject({
      title: 'Success!',
      message: 'Operation completed',
    });
  });

  it('should respect custom duration option', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success('Quick message', {
        duration: 1000,
      });
    });

    const toasts = useUIStore.getState().toasts;

    expect(toasts[0]?.duration).toBe(1000);
  });

  it('should remove toast by ID', () => {
    const { result } = renderHook(() => useToast());

    let toastId: string;

    act(() => {
      toastId = result.current.success('Test message');
    });

    expect(useUIStore.getState().toasts).toHaveLength(1);

    act(() => {
      result.current.remove(toastId!);
    });

    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('should clear all toasts', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success('Message 1');
      result.current.error('Message 2');
      result.current.info('Message 3');
    });

    expect(useUIStore.getState().toasts).toHaveLength(3);

    act(() => {
      result.current.clear();
    });

    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('should handle multiple toasts', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success('Success message');
      result.current.error('Error message');
      result.current.warning('Warning message');
      result.current.info('Info message');
    });

    const toasts = useUIStore.getState().toasts;

    expect(toasts).toHaveLength(4);
    expect(toasts[0]?.type).toBe('success');
    expect(toasts[1]?.type).toBe('error');
    expect(toasts[2]?.type).toBe('warning');
    expect(toasts[3]?.type).toBe('info');
  });

  it('should return unique IDs for each toast', () => {
    const { result } = renderHook(() => useToast());

    const ids: string[] = [];

    act(() => {
      ids.push(result.current.success('Message 1'));
      ids.push(result.current.success('Message 2'));
      ids.push(result.current.success('Message 3'));
    });

    // All IDs should be unique
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });

  it('should auto-remove toast after duration', async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success('Auto-remove message', {
        duration: 1000,
      });
    });

    expect(useUIStore.getState().toasts).toHaveLength(1);

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(useUIStore.getState().toasts).toHaveLength(0);

    vi.useRealTimers();
  });

  it('should not auto-remove toast with duration 0', async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.custom('error', 'Persistent message', {
        duration: 0,
      });
    });

    expect(useUIStore.getState().toasts).toHaveLength(1);

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Toast should still be there
    expect(useUIStore.getState().toasts).toHaveLength(1);

    vi.useRealTimers();
  });

  it('should handle multiple hooks using the same store', () => {
    const { result: result1 } = renderHook(() => useToast());
    const { result: result2 } = renderHook(() => useToast());

    act(() => {
      result1.current.success('From hook 1');
    });

    act(() => {
      result2.current.error('From hook 2');
    });

    const toasts = useUIStore.getState().toasts;

    expect(toasts).toHaveLength(2);
    expect(toasts[0]?.message).toBe('From hook 1');
    expect(toasts[1]?.message).toBe('From hook 2');
  });

  it('should preserve toast options when provided', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success('Test', {
        title: 'Custom Title',
        duration: 2000,
      });
    });

    const toast = useUIStore.getState().toasts[0];

    expect(toast?.title).toBe('Custom Title');
    expect(toast?.duration).toBe(2000);
  });
});
