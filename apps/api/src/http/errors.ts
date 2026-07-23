export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export function notFound(message = 'The requested item could not be found.'): AppError {
  return new AppError(404, 'NOT_FOUND', message)
}

export function unauthorized(message = 'Please sign in to continue.'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message)
}

export function forbidden(message = 'You do not have permission to perform this action.'): AppError {
  return new AppError(403, 'FORBIDDEN', message)
}
