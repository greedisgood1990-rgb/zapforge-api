import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', {
    schema: {
      tags: ['System'],
      summary: 'Health check',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            name: { type: 'string' },
            version: { type: 'string' },
            uptime: { type: 'number' }
          }
        }
      }
    }
  }, async () => ({ ok: true, name: 'ZapForge API', version: '1.1.0', uptime: process.uptime() }));
}
