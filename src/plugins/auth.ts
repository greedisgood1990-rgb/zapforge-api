import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';

export async function registerAuth(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.decorate('verifyApiKey', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.REQUIRE_API_KEY) return;

    const apiKey = request.headers['x-api-key'];
    const authorization = request.headers.authorization;
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    const token = Array.isArray(apiKey) ? apiKey[0] : apiKey || bearer;

    if (token !== config.API_KEY) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Invalid or missing API key. Use x-api-key or Authorization: Bearer <token>.'
      });
    }
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    verifyApiKey: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
