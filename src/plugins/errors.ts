import type { FastifyInstance } from 'fastify';

export async function registerErrors(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const candidate = error as {
      statusCode?: unknown;
      message?: unknown;
      code?: unknown;
      details?: unknown;
      retryAfterSeconds?: unknown;
    };
    const statusCode = typeof candidate.statusCode === 'number' && candidate.statusCode >= 400
      ? candidate.statusCode
      : 500;
    const message = typeof candidate.message === 'string' && candidate.message
      ? candidate.message
      : 'Unexpected error.';
    const errorCode = typeof candidate.code === 'string' && candidate.code
      ? candidate.code
      : statusCode >= 500 ? 'internal_error' : 'request_error';

    if (typeof candidate.retryAfterSeconds === 'number') {
      reply.header('retry-after', String(Math.max(1, Math.ceil(candidate.retryAfterSeconds))));
    }

    reply.code(statusCode).send({
      error: errorCode,
      message,
      ...(candidate.details && typeof candidate.details === 'object' ? { details: candidate.details } : {})
    });
  });
}
