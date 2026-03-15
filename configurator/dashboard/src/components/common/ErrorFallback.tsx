// SPDX-License-Identifier: MIT
import { Button } from './Button';

export interface ErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
  showHomeButton?: boolean;
  onHome?: () => void;
}

export function ErrorFallback({
  error,
  resetError,
  showHomeButton = false,
  onHome
}: ErrorFallbackProps) {
  const handleReload = () => {
    if (resetError) {
      resetError();
    } else {
      window.location.reload();
    }
  };

  const handleHome = () => {
    if (onHome) {
      onHome();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-900 p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <span className="text-4xl text-red-400">⚠</span>
          </div>
        </div>

        {/* Error Message */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">
            Something went wrong
          </h1>
          <p className="text-surface-400">
            We encountered an unexpected error. Please try reloading the page.
          </p>
        </div>

        {/* Error Details */}
        {error && (
          <div className="bg-surface-800 border border-surface-700 rounded-lg p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-surface-300 mb-1">
                Error Message
              </h3>
              <p className="text-sm font-mono text-red-400 break-words">
                {error.message}
              </p>
            </div>

            {error.stack && (
              <details className="text-xs">
                <summary className="cursor-pointer text-surface-400 hover:text-surface-300 select-none">
                  Stack Trace
                </summary>
                <pre className="mt-2 p-3 bg-surface-900 rounded overflow-auto max-h-48 text-surface-500">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={handleReload}
            variant="primary"
            size="md"
            className="w-full justify-center"
          >
            <span className="mr-2">↻</span>
            Reload Page
          </Button>

          {showHomeButton && (
            <Button
              onClick={handleHome}
              variant="secondary"
              size="md"
              className="w-full justify-center"
            >
              <span className="mr-2">⌂</span>
              Go to Home
            </Button>
          )}
        </div>

        {/* Help Text */}
        <div className="text-center">
          <p className="text-xs text-surface-500">
            If this problem persists, please check the console for more details
            or contact support.
          </p>
        </div>
      </div>
    </div>
  );
}
