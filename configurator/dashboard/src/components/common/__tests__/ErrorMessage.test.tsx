// SPDX-License-Identifier: MIT
/**
 * Tests for ErrorMessage component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorMessage } from '../ErrorMessage';
import { NetworkError, ValidationError, ServerError, ApiError } from '@/utils/errors';

describe('ErrorMessage', () => {
  it('should not render when error is null', () => {
    const { container } = render(<ErrorMessage error={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render error message', () => {
    render(<ErrorMessage error="Test error message" />);
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should display network error with appropriate styling', () => {
    const error = new NetworkError('Connection failed');
    render(
      <ErrorMessage
        error={error.userMessage}
        errorObj={error}
        isNetworkError={true}
      />
    );

    expect(screen.getByText(/Cannot connect to the server/)).toBeInTheDocument();
    expect(screen.getByText(/check that the server is running/)).toBeInTheDocument();
  });

  it('should display validation error with details', () => {
    const error = new ValidationError('Validation failed', { field: 'email' });
    render(
      <ErrorMessage
        error={error.message}
        errorObj={error}
        isValidationError={true}
        showDetails={true}
      />
    );

    expect(screen.getByText('Validation failed')).toBeInTheDocument();
  });

  it('should display server error with suggestion', () => {
    const error = new ServerError('Internal server error');
    render(
      <ErrorMessage
        error={error.userMessage}
        errorObj={error}
        isServerError={true}
      />
    );

    expect(screen.getByText(/server encountered an error/)).toBeInTheDocument();
    expect(screen.getByText(/temporary issue/)).toBeInTheDocument();
  });

  it('should show retry button for network errors when onRetry is provided', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const error = new NetworkError();

    render(
      <ErrorMessage
        error={error.userMessage}
        isNetworkError={true}
        onRetry={onRetry}
      />
    );

    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();

    await user.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('should not show retry button when onRetry is not provided', () => {
    render(
      <ErrorMessage
        error="Network error"
        isNetworkError={true}
      />
    );

    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('should show error code when showDetails is true', () => {
    const error = new ApiError('Test error', 400, 'TEST_ERROR');
    render(
      <ErrorMessage
        error={error.message}
        errorObj={error}
        showDetails={true}
      />
    );

    expect(screen.getByText(/Error Code: TEST_ERROR/)).toBeInTheDocument();
  });

  it('should show status code when showDetails is true', () => {
    const error = new ApiError('Test error', 404);
    render(
      <ErrorMessage
        error={error.message}
        errorObj={error}
        showDetails={true}
      />
    );

    expect(screen.getByText(/HTTP Status: 404/)).toBeInTheDocument();
  });

  it('should not show status code for network errors (status 0)', () => {
    const error = new NetworkError();
    render(
      <ErrorMessage
        error={error.message}
        errorObj={error}
        showDetails={true}
      />
    );

    expect(screen.queryByText(/HTTP Status/)).not.toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <ErrorMessage
        error="Test error"
        className="custom-class"
      />
    );

    const errorDiv = container.firstChild as HTMLElement;
    expect(errorDiv).toHaveClass('custom-class');
  });
});
