import type { FastifyInstance } from 'fastify';
import type { SessionManager } from '../core/sessionManager.js';
import type { MediaKind } from '../core/types.js';

export async function messageRoutes(app: FastifyInstance, manager: SessionManager): Promise<void> {
  app.post<{
    Body: {
      sessionId?: string;
      to: string;
      body?: string;
      text?: string;
      no_link_preview?: boolean;
      noLinkPreview?: boolean;
      typing_time?: number;
      typingTimeMs?: number;
    };
  }>('/v1/messages/text', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Messages'],
      summary: 'Send text message',
      description: 'Whapi-inspired payload: to + body, with sessionId added for self-hosted multi-session mode.',
      body: {
        type: 'object',
        required: ['to'],
        properties: {
          sessionId: { type: 'string', default: 'default' },
          to: { type: 'string', description: 'Phone, group JID or chat JID' },
          body: { type: 'string' },
          text: { type: 'string' },
          no_link_preview: { type: 'boolean' },
          typing_time: { type: 'number' }
        }
      }
    }
  }, async (request) => {
    const body = request.body.body || request.body.text;
    if (!body) throw new Error('body or text is required.');
    return {
      data: await manager.sendText({
        sessionId: request.body.sessionId || 'default',
        to: request.body.to,
        body,
        noLinkPreview: request.body.noLinkPreview ?? request.body.no_link_preview,
        typingTimeMs: request.body.typingTimeMs ?? request.body.typing_time
      })
    };
  });

  app.post<{
    Body: {
      sessionId?: string;
      to: string;
      type: MediaKind;
      url?: string;
      base64?: string;
      filename?: string;
      caption?: string;
      mimetype?: string;
    };
  }>('/v1/messages/media', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Messages'],
      summary: 'Send media message',
      body: {
        type: 'object',
        required: ['to', 'type'],
        properties: {
          sessionId: { type: 'string', default: 'default' },
          to: { type: 'string' },
          type: { type: 'string', enum: ['image', 'video', 'audio', 'document', 'sticker'] },
          url: { type: 'string' },
          base64: { type: 'string' },
          filename: { type: 'string' },
          caption: { type: 'string' },
          mimetype: { type: 'string' }
        }
      }
    }
  }, async (request) => ({
    data: await manager.sendMedia({
      sessionId: request.body.sessionId || 'default',
      to: request.body.to,
      type: request.body.type,
      url: request.body.url,
      base64: request.body.base64,
      filename: request.body.filename,
      caption: request.body.caption,
      mimetype: request.body.mimetype
    })
  }));
}
