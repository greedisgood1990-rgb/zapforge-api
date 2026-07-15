export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string = 'request_error',
    public readonly details?: Record<string, unknown>,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function conflict(message: string, code = 'conflict'): ApiError {
  return new ApiError(message, 409, code);
}

export function tooManyRequests(
  message: string,
  retryAfterSeconds: number,
  code = 'rate_limited',
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(message, 429, code, details, Math.max(1, Math.ceil(retryAfterSeconds)));
}
