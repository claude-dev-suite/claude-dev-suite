// SPDX-License-Identifier: MIT
/**
 * Tests for error utilities
 */

import { describe, it, expect } from 'vitest';
import {
  ApiError,
  NetworkError,
  ValidationError,
  NotFoundError,
  ServerError,
  UnauthorizedError,
  ForbiddenError,
  TimeoutError,
  createApiError,
  createNetworkError,
  isApiError,
  isNetworkError,
  isValidationError,
  isServerError,
  getUserErrorMessage,
} from '../errors';

describe('ApiError', () => {
  it('should create an ApiError with correct properties', () => {
    const error = new ApiError('Test error', 400, 'TEST_ERROR', { field: 'value' });

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.errorCode).toBe('TEST_ERROR');
    expect(error.details).toEqual({ field: 'value' });
    expect(error.name).toBe('ApiError');
  });

  it('should identify client errors (4xx)', () => {
    const error = new ApiError('Client error', 400);
    expect(error.isClientError).toBe(true);
    expect(error.isServerError).toBe(false);
    expect(error.isNetworkError).toBe(false);
  });

  it('should identify server errors (5xx)', () => {
    const error = new ApiError('Server error', 500);
    expect(error.isServerError).toBe(true);
    expect(error.isClientError).toBe(false);
    expect(error.isNetworkError).toBe(false);
  });

  it('should identify network errors (0)', () => {
    const error = new ApiError('Network error', 0);
    expect(error.isNetworkError).toBe(true);
    expect(error.isClientError).toBe(false);
    expect(error.isServerError).toBe(false);
  });

  it('should provide user-friendly messages for different error types', () => {
    const networkError = new ApiError('Network error', 0);
    expect(networkError.userMessage).toContain('Cannot connect to the server');

    const serverError = new ApiError('Server error', 500);
    expect(serverError.userMessage).toContain('server encountered an error');

    const clientError = new ApiError('Custom client error', 400);
    expect(clientError.userMessage).toBe('Custom client error');
  });
});

describe('Specific Error Classes', () => {
  it('should create NetworkError', () => {
    const error = new NetworkError();
    expect(error.name).toBe('NetworkError');
    expect(error.statusCode).toBe(0);
    expect(error.errorCode).toBe('NETWORK_ERROR');
    expect(error.isNetworkError).toBe(true);
  });

  it('should create ValidationError', () => {
    const details = { field: 'username', message: 'required' };
    const error = new ValidationError('Validation failed', details);
    expect(error.name).toBe('ValidationError');
    expect(error.statusCode).toBe(400);
    expect(error.errorCode).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(details);
  });

  it('should create NotFoundError', () => {
    const error = new NotFoundError();
    expect(error.name).toBe('NotFoundError');
    expect(error.statusCode).toBe(404);
    expect(error.errorCode).toBe('NOT_FOUND');
  });

  it('should create ServerError', () => {
    const error = new ServerError();
    expect(error.name).toBe('ServerError');
    expect(error.statusCode).toBe(500);
    expect(error.errorCode).toBe('SERVER_ERROR');
  });

  it('should create UnauthorizedError', () => {
    const error = new UnauthorizedError();
    expect(error.name).toBe('UnauthorizedError');
    expect(error.statusCode).toBe(401);
    expect(error.errorCode).toBe('UNAUTHORIZED');
  });

  it('should create ForbiddenError', () => {
    const error = new ForbiddenError();
    expect(error.name).toBe('ForbiddenError');
    expect(error.statusCode).toBe(403);
    expect(error.errorCode).toBe('FORBIDDEN');
  });

  it('should create TimeoutError', () => {
    const error = new TimeoutError();
    expect(error.name).toBe('TimeoutError');
    expect(error.statusCode).toBe(408);
    expect(error.errorCode).toBe('TIMEOUT');
  });
});

describe('createApiError', () => {
  it('should create ValidationError for 400 status', async () => {
    const response = new Response(
      JSON.stringify({ error: 'Invalid input' }),
      {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': 'application/json' },
      }
    );

    const error = await createApiError(response);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe('Invalid input');
  });

  it('should create NotFoundError for 404 status', async () => {
    const response = new Response(null, {
      status: 404,
      statusText: 'Not Found',
    });

    const error = await createApiError(response);
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('should create ServerError for 500 status', async () => {
    const response = new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'application/json' },
      }
    );

    const error = await createApiError(response);
    expect(error).toBeInstanceOf(ServerError);
    expect(error.message).toBe('Internal server error');
  });

  it('should create UnauthorizedError for 401 status', async () => {
    const response = new Response(null, {
      status: 401,
      statusText: 'Unauthorized',
    });

    const error = await createApiError(response);
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('should create ForbiddenError for 403 status', async () => {
    const response = new Response(null, {
      status: 403,
      statusText: 'Forbidden',
    });

    const error = await createApiError(response);
    expect(error).toBeInstanceOf(ForbiddenError);
  });

  it('should create TimeoutError for 408 status', async () => {
    const response = new Response(null, {
      status: 408,
      statusText: 'Request Timeout',
    });

    const error = await createApiError(response);
    expect(error).toBeInstanceOf(TimeoutError);
  });

  it('should handle non-JSON response body', async () => {
    const response = new Response('Plain text error', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'content-type': 'text/plain' },
    });

    const error = await createApiError(response);
    expect(error).toBeInstanceOf(ServerError);
    expect(error.message).toBe('Plain text error');
  });

  it('should use status text when body is empty', async () => {
    const response = new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });

    const error = await createApiError(response);
    expect(error.message).toBe('500 Internal Server Error');
  });

  it('should parse errorCode and details from response', async () => {
    const response = new Response(
      JSON.stringify({
        error: 'Validation failed',
        errorCode: 'VAL_001',
        details: { field: 'email', reason: 'invalid format' },
      }),
      {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': 'application/json' },
      }
    );

    const error = await createApiError(response);
    expect(error.errorCode).toBe('VAL_001');
    expect(error.details).toEqual({ field: 'email', reason: 'invalid format' });
  });
});

describe('createNetworkError', () => {
  it('should create NetworkError from Error object', () => {
    const originalError = new Error('Connection refused');
    const error = createNetworkError(originalError);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.message).toBe('Connection refused');
  });

  it('should create NetworkError from unknown error', () => {
    const error = createNetworkError('string error');

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.message).toContain('Network connection failed');
  });
});

describe('Type Guards', () => {
  it('isApiError should correctly identify ApiError', () => {
    expect(isApiError(new ApiError('test', 400))).toBe(true);
    expect(isApiError(new NetworkError())).toBe(true);
    expect(isApiError(new Error('test'))).toBe(false);
    expect(isApiError('string')).toBe(false);
  });

  it('isNetworkError should correctly identify NetworkError', () => {
    expect(isNetworkError(new NetworkError())).toBe(true);
    expect(isNetworkError(new ApiError('test', 0))).toBe(false);
    expect(isNetworkError(new Error('test'))).toBe(false);
  });

  it('isValidationError should correctly identify ValidationError', () => {
    expect(isValidationError(new ValidationError('test'))).toBe(true);
    expect(isValidationError(new ApiError('test', 400))).toBe(false);
    expect(isValidationError(new Error('test'))).toBe(false);
  });

  it('isServerError should correctly identify ServerError', () => {
    expect(isServerError(new ServerError())).toBe(true);
    expect(isServerError(new ApiError('test', 500))).toBe(false);
    expect(isServerError(new Error('test'))).toBe(false);
  });
});

describe('getUserErrorMessage', () => {
  it('should return userMessage for ApiError', () => {
    const error = new NetworkError('Custom network error');
    const message = getUserErrorMessage(error);
    expect(message).toContain('Cannot connect to the server');
  });

  it('should return message for regular Error', () => {
    const error = new Error('Regular error');
    const message = getUserErrorMessage(error);
    expect(message).toBe('Regular error');
  });

  it('should return default message for unknown error', () => {
    const message = getUserErrorMessage('string error');
    expect(message).toBe('An unexpected error occurred. Please try again.');
  });
});
