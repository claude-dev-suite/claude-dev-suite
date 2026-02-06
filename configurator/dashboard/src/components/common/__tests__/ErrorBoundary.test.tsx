// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

// Component that throws an error
function ThrowError({ shouldThrow = false }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>Normal content</div>;
}

describe('ErrorBoundary', () => {
  it('should render children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('should catch errors and display default fallback UI', () => {
    // Suppress console.error for this test
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('should display custom fallback when provided', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('should call onError callback when error occurs', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onErrorMock = vi.fn();

    render(
      <ErrorBoundary onError={onErrorMock}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error' }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );

    consoleErrorSpy.mockRestore();
  });

  it('should display a Try Again button in error state', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Error state should show Try Again button
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('should display component stack in details', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const detailsElement = screen.getByText(/component stack/i);
    expect(detailsElement).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('should log errors using the logger utility', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Logger should have been called (console.error is called by the logger)
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
