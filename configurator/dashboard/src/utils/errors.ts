// SPDX-License-Identifier: MIT
/**
 * Typed error classes for API error handling
 *
 * Provides structured error types for different HTTP status codes
 * and network failures, enabling better error handling and user feedback.
 */

/**
 * Base API error class
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  get isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  get isServerError(): boolean {
    return this.statusCode >= 500;
  }

  get isNetworkError(): boolean {
    return this.statusCode === 0;
  }

  /**
   * Get user-friendly message based on error type
   */
  get userMessage(): string {
    if (this.isNetworkError) {
      return 'Cannot connect to the server. Please check your connection and try again.';
    }
    if (this.isServerError) {
      return 'The server encountered an error. Please try again later.';
    }
    return this.message;
  }
}

/**
 * Network connection error
 */
export class NetworkError extends ApiError {
  constructor(message = 'Network connection failed') {
    super(message, 0, 'NETWORK_ERROR');
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  get userMessage(): string {
    return this.message || 'The request contains invalid data.';
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }

  get userMessage(): string {
    return this.message || 'The requested resource was not found.';
  }
}

/**
 * Server error (5xx)
 */
export class ServerError extends ApiError {
  constructor(message = 'Internal server error') {
    super(message, 500, 'SERVER_ERROR');
    this.name = 'ServerError';
    Object.setPrototypeOf(this, ServerError.prototype);
  }

  get userMessage(): string {
    return 'The server encountered an error. Please try again later.';
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }

  get userMessage(): string {
    return 'You are not authorized to perform this action.';
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }

  get userMessage(): string {
    return 'You do not have permission to access this resource.';
  }
}

/**
 * Request timeout error (408)
 */
export class TimeoutError extends ApiError {
  constructor(message = 'Request timeout') {
    super(message, 408, 'TIMEOUT');
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }

  get userMessage(): string {
    return 'The request took too long to complete. Please try again.';
  }
}

/**
 * Helper to create appropriate error from response
 */
export async function createApiError(response: Response): Promise<ApiError> {
  let message = `${response.status} ${response.statusText}`;
  let errorCode: string | undefined;
  let details: unknown;

  // Try to parse error response body
  try {
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const body = await response.json();
      if (body.error) message = body.error;
      if (body.message) message = body.message;
      if (body.errorCode) errorCode = body.errorCode;
      if (body.details) details = body.details;
    } else {
      const text = await response.text();
      if (text) message = text;
    }
  } catch {
    // Response body is not parseable, use status text
  }

  // Create specific error types based on status code
  let error: ApiError;

  switch (response.status) {
    case 400:
      error = new ValidationError(message, details);
      break;
    case 401:
      error = new UnauthorizedError(message);
      break;
    case 403:
      error = new ForbiddenError(message);
      break;
    case 404:
      error = new NotFoundError(message);
      break;
    case 408:
      error = new TimeoutError(message);
      break;
    default:
      if (response.status >= 500) {
        error = new ServerError(message);
      } else {
        error = new ApiError(message, response.status, errorCode, details);
      }
  }

  // Preserve custom error code from response if provided
  if (errorCode) {
    error.errorCode = errorCode;
  }

  return error;
}

/**
 * Helper to create error from fetch failure (network error)
 */
export function createNetworkError(error: unknown): NetworkError {
  const message =
    error instanceof Error
      ? error.message
      : 'Network connection failed. Please check your connection and try again.';
  return new NetworkError(message);
}

/**
 * Type guard to check if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Type guard to check if error is a NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Type guard to check if error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Type guard to check if error is a ServerError
 */
export function isServerError(error: unknown): error is ServerError {
  return error instanceof ServerError;
}

/**
 * Get user-friendly error message from any error
 */
export function getUserErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}
