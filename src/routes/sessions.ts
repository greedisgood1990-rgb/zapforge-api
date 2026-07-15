import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import type { SessionManager } from '../core/sessionManager.js';
import type { EngineName } from '../core/types.js';

const sessionIdSchema = { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$' } as const;

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
          id: { ...sessionIdSchema, description: 'Stable session slug, e.g. sales-main' },
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

  app.get<{ Params: { id: string } }>('/v1/sessions/:id/capabilities', {
    preHandler: app.verifyApiKey,
    schema: { tags: ['Sessions'], summary: 'List provider capabilities and experimental features' }
  }, async (request) => ({ data: manager.capabilities(request.params.id) }));


  app.post<{
    Params: { id: string };
    Body: { phoneNumber: string };
  }>('/v1/sessions/:id/pairing-code', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Sessions'],
      summary: 'Generate a phone-number pairing code',
      description: 'Starts the session if needed, then requests one pairing code. Requests are serialized and protected by cooldown and lockout limits.',
      body: {
        type: 'object',
        required: ['phoneNumber'],
        properties: {
          phoneNumber: {
            type: 'string',
            pattern: '^[0-9+(). -]{8,24}$',
            description: 'Phone number with country code. Formatting characters are removed before the provider call.'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' },
                phoneNumber: { type: 'string' },
                maskedPhoneNumber: { type: 'string' },
                code: { type: 'string' },
                formattedCode: { type: 'string' },
                generatedAt: { type: 'string' },
                expiresAt: { type: 'string' },
                nextAllowedAt: { type: 'string' },
                reused: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async (request) => {
    await manager.start(request.params.id);
    return { data: await manager.requestPairingCode(request.params.id, request.body.phoneNumber) };
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
