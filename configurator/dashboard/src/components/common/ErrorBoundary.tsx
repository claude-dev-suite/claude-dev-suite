// SPDX-License-Identifier: MIT
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../../utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  recoveryAttempts: number;
}

const MAX_RECOVERY_ATTEMPTS = 3;

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      recoveryAttempts: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log with full context including component stack
    logger.error('ErrorBoundary caught error', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      },
      recoveryAttempts: this.state.recoveryAttempts,
      digest: errorInfo.digest,
    });

    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    const newAttempts = this.state.recoveryAttempts + 1;

    logger.info('ErrorBoundary recovery attempt', {
      attempt: newAttempts,
      maxAttempts: MAX_RECOVERY_ATTEMPTS,
    });

    if (newAttempts >= MAX_RECOVERY_ATTEMPTS) {
      logger.warn('ErrorBoundary max recovery attempts reached', {
        attempts: newAttempts,
      });
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      recoveryAttempts: newAttempts,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const maxAttemptsReached = this.state.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS;

      return (
        <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg m-4">
          <h2 className="text-lg font-semibold text-red-400 mb-2">
            Something went wrong
          </h2>
          <div className="text-sm text-red-300 mb-4">
            <p className="font-mono">{this.state.error?.message}</p>
          </div>
          {this.state.errorInfo && (
            <details className="text-xs text-surface-400 mb-4">
              <summary className="cursor-pointer hover:text-surface-300 mb-2">
                Component Stack
              </summary>
              <pre className="p-3 bg-surface-900 rounded overflow-auto max-h-48 text-surface-400">
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          {maxAttemptsReached && (
            <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-300">
              Maximum recovery attempts reached. Please reload the page.
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={this.handleReset}
              disabled={maxAttemptsReached}
              className="px-4 py-2 bg-surface-700 hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm"
            >
              Try Again {this.state.recoveryAttempts > 0 && `(${this.state.recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS})`}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded text-sm"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
