import type { FastifyInstance } from 'fastify';
import type { SessionManager } from '../core/sessionManager.js';

export async function compatRoutes(app: FastifyInstance, manager: SessionManager): Promise<void> {
  app.post<{
    Body: { to: string; body?: string; text?: string; sessionId?: string; channel?: string; no_link_preview?: boolean };
  }>('/messages/text', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Compatibility'],
      summary: 'Whapi-style alias for /v1/messages/text',
      description: 'Drop-in friendly alias for clients that already call POST /messages/text with to/body.'
    }
  }, async (request) => {
    const body = request.body.body || request.body.text;
    if (!body) throw new Error('body or text is required.');
    return {
      data: await manager.sendText({
        sessionId: request.body.sessionId || request.body.channel || 'default',
        to: request.body.to,
        body,
        noLinkPreview: request.body.no_link_preview
      })
    };
  });
}
