import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import type { SessionManager } from '../core/sessionManager.js';
import type { EngineName } from '../core/types.js';

export async function sessionRoutes(app: FastifyInstance, manager: SessionManager): Promise<void> {
  app.get('/v1/sessions', { preHandler: app.verifyApiKey, schema: { tags: ['Sessions'], summary: 'List sessions' } }, async () => ({
    data: manager.list()
  }));

  app.post<{
    Body: { id: string; engine?: EngineName };
  }>('/v1/sessions', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Sessions'],
      summary: 'Create/start a session',
      body: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', minLength: 2, description: 'Stable session slug, e.g. sales-main' },
          engine: { type: 'string', enum: ['baileys'], default: 'baileys' }
        }
      }
    }
  }, async (request) => ({
    data: await manager.start(request.body.id, request.body.engine || 'baileys')
  }));

  app.get<{ Params: { id: string } }>('/v1/sessions/:id', { preHandler: app.verifyApiKey, schema: { tags: ['Sessions'], summary: 'Get a session' } }, async (request, reply) => {
    const session = manager.get(request.params.id);
    if (!session) return reply.code(404).send({ error: 'not_found', message: 'Session not found.' });
    return { data: session };
  });

  app.post<{ Params: { id: string } }>('/v1/sessions/:id/start', { preHandler: app.verifyApiKey, schema: { tags: ['Sessions'], summary: 'Start a stored session' } }, async (request) => ({
    data: await manager.start(request.params.id)
  }));

  app.post<{ Params: { id: string } }>('/v1/sessions/:id/stop', { preHandler: app.verifyApiKey, schema: { tags: ['Sessions'], summary: 'Stop a running session without deleting auth files' } }, async (request) => ({
    data: await manager.stop(request.params.id)
  }));

  app.post<{ Params: { id: string } }>('/v1/sessions/:id/logout', { preHandler: app.verifyApiKey, schema: { tags: ['Sessions'], summary: 'Logout the phone from this session' } }, async (request) => ({
    data: await manager.logout(request.params.id)
  }));

  app.delete<{ Params: { id: string } }>('/v1/sessions/:id', { preHandler: app.verifyApiKey, schema: { tags: ['Sessions'], summary: 'Delete a session and its auth files' } }, async (request) => {
    await manager.remove(request.params.id);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/v1/sessions/:id/qr', { preHandler: app.verifyApiKey, schema: { tags: ['Sessions'], summary: 'Get the latest QR as raw text and data URL' } }, async (request, reply) => {
    const session = manager.get(request.params.id);
    if (!session) return reply.code(404).send({ error: 'not_found', message: 'Session not found.' });
    if (!session.qr) return reply.code(404).send({ error: 'qr_not_available', message: 'QR not available. Start the session and wait for state=qr.' });
    return {
      data: {
        sessionId: session.id,
        qr: session.qr,
        image: await QRCode.toDataURL(session.qr)
      }
    };
  });
}
