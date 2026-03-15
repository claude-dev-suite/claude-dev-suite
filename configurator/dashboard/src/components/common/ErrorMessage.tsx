// SPDX-License-Identifier: MIT
/**
 * ErrorMessage component
 *
 * Displays error messages with appropriate styling and actions based on error type.
 * Supports retry buttons for network errors and detailed validation error messages.
 */

import React from 'react';
import { Button } from './Button';
import { ApiError } from '@/utils/errors';

export interface ErrorMessageProps {
  /** Error message to display */
  error: string | null;
  /** Full error object with type information */
  errorObj?: ApiError | null;
  /** Whether the error is a network error */
  isNetworkError?: boolean;
  /** Whether the error is a validation error */
  isValidationError?: boolean;
  /** Whether the error is a server error */
  isServerError?: boolean;
  /** Retry function (typically displayed for network errors) */
  onRetry?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Show full error details (useful for debugging) */
  showDetails?: boolean;
}

/**
 * Get icon based on error type
 */
function getErrorIcon(
  isNetworkError?: boolean,
  isValidationError?: boolean,
  isServerError?: boolean
): string {
  if (isNetworkError) return '⚠️';
  if (isValidationError) return '❌';
  if (isServerError) return '🔥';
  return '⚠️';
}

/**
 * Get background color based on error type
 */
function getErrorBgColor(
  isNetworkError?: boolean,
  isValidationError?: boolean,
  isServerError?: boolean
): string {
  if (isNetworkError) return 'bg-orange-500/10 border-orange-500/30';
  if (isValidationError) return 'bg-yellow-500/10 border-yellow-500/30';
  if (isServerError) return 'bg-red-500/10 border-red-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

/**
 * Get text color based on error type
 */
function getErrorTextColor(
  isNetworkError?: boolean,
  isValidationError?: boolean,
  isServerError?: boolean
): string {
  if (isNetworkError) return 'text-orange-400';
  if (isValidationError) return 'text-yellow-400';
  if (isServerError) return 'text-red-400';
  return 'text-red-400';
}

export function ErrorMessage({
  error,
  errorObj,
  isNetworkError,
  isValidationError,
  isServerError,
  onRetry,
  className = '',
  showDetails = false,
}: ErrorMessageProps): React.ReactElement | null {
  // Don't render if no error
  if (!error) return null;

  const icon = getErrorIcon(isNetworkError, isValidationError, isServerError);
  const bgColor = getErrorBgColor(isNetworkError, isValidationError, isServerError);
  const textColor = getErrorTextColor(isNetworkError, isValidationError, isServerError);

  // Type assertion after null check - error is string here
  const errorMessage = error;

  return (
    <div className={`p-4 border rounded-lg ${bgColor} ${className}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <span className="text-2xl flex-shrink-0 mt-0.5">{icon}</span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Main error message */}
          <div className={`font-medium ${textColor}`}>{errorMessage}</div>

          {/* Validation error details */}
          {isValidationError && errorObj?.details !== undefined && showDetails && (
            <div className="mt-2 text-sm text-surface-300">
              <div className="font-medium mb-1">Details:</div>
              <pre className="bg-surface-900/50 p-2 rounded overflow-x-auto">
                {JSON.stringify(errorObj.details, null, 2)}
              </pre>
            </div>
          )}

          {/* Server error suggestion */}
          {isServerError && (
            <div className="mt-2 text-sm text-surface-300">
              This is likely a temporary issue. Please try again in a few moments.
            </div>
          )}

          {/* Network error suggestion */}
          {isNetworkError && (
            <div className="mt-2 text-sm text-surface-300">
              Please check that the server is running and try again.
            </div>
          )}

          {/* Error code */}
          {showDetails && errorObj?.errorCode && (
            <div className="mt-2 text-xs text-surface-400">
              Error Code: {errorObj.errorCode}
            </div>
          )}

          {/* Status code */}
          {showDetails && errorObj?.statusCode !== undefined && errorObj.statusCode > 0 && (
            <div className="mt-1 text-xs text-surface-400">
              HTTP Status: {errorObj.statusCode}
            </div>
          )}
        </div>

        {/* Retry button for network errors */}
        {onRetry && isNetworkError && (
          <Button variant="secondary" size="sm" onClick={onRetry} className="flex-shrink-0">
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
