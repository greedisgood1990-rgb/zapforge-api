import type { FastifyInstance } from 'fastify';

export async function registerErrors(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const candidate = error as { statusCode?: unknown; message?: unknown };
    const statusCode = typeof candidate.statusCode === 'number' && candidate.statusCode >= 400
      ? candidate.statusCode
      : 500;
    const message = typeof candidate.message === 'string' && candidate.message
      ? candidate.message
      : 'Unexpected error.';

    reply.code(statusCode).send({
      error: statusCode >= 500 ? 'internal_error' : 'request_error',
      message
    });
  });
}
