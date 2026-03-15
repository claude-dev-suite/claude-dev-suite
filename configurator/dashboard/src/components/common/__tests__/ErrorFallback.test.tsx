// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ErrorFallback } from '../ErrorFallback';

describe('ErrorFallback', () => {
  it('should render error message with default text', () => {
    render(<ErrorFallback />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/We encountered an unexpected error/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });

  it('should display error details when error prop is provided', () => {
    const error = new Error('Database connection failed');
    render(<ErrorFallback error={error} />);

    expect(screen.getByText('Error Message')).toBeInTheDocument();
    expect(screen.getByText('Database connection failed')).toBeInTheDocument();
  });

  it('should show stack trace in details element', () => {
    const error = new Error('Test error');
    error.stack = 'Error: Test error\n  at Component.tsx:10:15';

    render(<ErrorFallback error={error} />);

    const stackTraceButton = screen.getByText(/stack trace/i);
    expect(stackTraceButton).toBeInTheDocument();
  });

  it('should call resetError when Reload button is clicked', async () => {
    const user = userEvent.setup();
    const resetErrorMock = vi.fn();

    render(<ErrorFallback resetError={resetErrorMock} />);

    const reloadButton = screen.getByRole('button', { name: /reload page/i });
    await user.click(reloadButton);

    expect(resetErrorMock).toHaveBeenCalledTimes(1);
  });

  it('should reload window when Reload button is clicked without resetError', async () => {
    const user = userEvent.setup();
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    render(<ErrorFallback />);

    const reloadButton = screen.getByRole('button', { name: /reload page/i });
    await user.click(reloadButton);

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('should show home button when showHomeButton is true', () => {
    render(<ErrorFallback showHomeButton={true} />);

    expect(screen.getByRole('button', { name: /go to home/i })).toBeInTheDocument();
  });

  it('should not show home button when showHomeButton is false', () => {
    render(<ErrorFallback showHomeButton={false} />);

    expect(screen.queryByRole('button', { name: /go to home/i })).not.toBeInTheDocument();
  });

  it('should call onHome when home button is clicked', async () => {
    const user = userEvent.setup();
    const onHomeMock = vi.fn();

    render(<ErrorFallback showHomeButton={true} onHome={onHomeMock} />);

    const homeButton = screen.getByRole('button', { name: /go to home/i });
    await user.click(homeButton);

    expect(onHomeMock).toHaveBeenCalledTimes(1);
  });

  it('should navigate to root when home button is clicked without onHome', async () => {
    const user = userEvent.setup();

    // Mock window.location.href
    delete (window as any).location;
    window.location = { href: '' } as any;

    render(<ErrorFallback showHomeButton={true} />);

    const homeButton = screen.getByRole('button', { name: /go to home/i });
    await user.click(homeButton);

    expect(window.location.href).toBe('/');
  });

  it('should display help text', () => {
    render(<ErrorFallback />);

    expect(screen.getByText(/If this problem persists/i)).toBeInTheDocument();
  });

  it('should use full screen layout', () => {
    const { container } = render(<ErrorFallback />);

    const mainDiv = container.firstChild as HTMLElement;
    expect(mainDiv).toHaveClass('min-h-screen');
    expect(mainDiv).toHaveClass('flex');
    expect(mainDiv).toHaveClass('items-center');
    expect(mainDiv).toHaveClass('justify-center');
  });

  it('should display error icon', () => {
    render(<ErrorFallback />);

    // Check for warning symbol
    expect(screen.getByText('⚠')).toBeInTheDocument();
  });
});
