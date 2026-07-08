import type { FastifyInstance } from 'fastify';
import type { WebhookService } from '../core/webhookService.js';

export async function webhookRoutes(app: FastifyInstance, webhooks: WebhookService): Promise<void> {
  app.get('/v1/webhooks', { preHandler: app.verifyApiKey, schema: { tags: ['Webhooks'], summary: 'List webhooks' } }, async () => ({
    data: webhooks.list()
  }));

  app.post<{
    Body: { url: string; events?: string[]; secret?: string; active?: boolean };
  }>('/v1/webhooks', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Webhooks'],
      summary: 'Create webhook',
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string' },
          events: { type: 'array', items: { type: 'string' }, default: ['*'] },
          secret: { type: 'string' },
          active: { type: 'boolean' }
        }
      }
    }
  }, async (request) => ({ data: await webhooks.create(request.body) }));

  app.patch<{
    Params: { id: string };
    Body: { url?: string; events?: string[]; secret?: string; active?: boolean };
  }>('/v1/webhooks/:id', { preHandler: app.verifyApiKey, schema: { tags: ['Webhooks'], summary: 'Update webhook' } }, async (request) => ({
    data: await webhooks.update(request.params.id, request.body)
  }));

  app.delete<{ Params: { id: string } }>('/v1/webhooks/:id', { preHandler: app.verifyApiKey, schema: { tags: ['Webhooks'], summary: 'Delete webhook' } }, async (request) => {
    await webhooks.remove(request.params.id);
    return { ok: true };
  });
}
