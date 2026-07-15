import type { FastifyInstance } from 'fastify';
import type { SessionManager } from '../core/sessionManager.js';
import type {
  InteractiveButton,
  InteractiveListSection,
  MediaKind
} from '../core/types.js';

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
          body: { type: 'string', maxLength: 65536 },
          text: { type: 'string', maxLength: 65536 },
          no_link_preview: { type: 'boolean' },
          typing_time: { type: 'number', minimum: 0, maximum: 10000 }
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

  app.post<{
    Body: {
      sessionId?: string;
      groupId: string;
      body: string;
      mentionAll?: boolean;
      mentions?: string[];
      appendMentions?: boolean;
      includeAdmins?: boolean;
    };
  }>('/v1/messages/group-mention', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Messages', 'Groups'],
      summary: 'Send a group message mentioning all or selected participants',
      body: {
        type: 'object',
        required: ['groupId', 'body'],
        properties: {
          sessionId: { type: 'string', default: 'default' },
          groupId: { type: 'string' },
          body: { type: 'string', minLength: 1, maxLength: 50000 },
          mentionAll: { type: 'boolean', default: true },
          mentions: { type: 'array', items: { type: 'string' }, maxItems: 4096 },
          appendMentions: { type: 'boolean', default: true },
          includeAdmins: { type: 'boolean', default: true }
        }
      }
    }
  }, async (request) => ({
    data: await manager.sendGroupMention({
      sessionId: request.body.sessionId || 'default',
      groupId: request.body.groupId,
      body: request.body.body,
      mentionAll: request.body.mentionAll,
      mentions: request.body.mentions,
      appendMentions: request.body.appendMentions,
      includeAdmins: request.body.includeAdmins
    })
  }));

  app.post<{
    Body: {
      sessionId?: string;
      to: string;
      body: string;
      title?: string;
      footer?: string;
      fallbackText?: string;
      disableFallback?: boolean;
      buttons: InteractiveButton[];
    };
  }>('/v1/messages/buttons', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Messages', 'Interactive'],
      summary: 'Send native-flow interactive buttons (experimental on Baileys)',
      body: {
        type: 'object',
        required: ['to', 'body', 'buttons'],
        properties: {
          sessionId: { type: 'string', default: 'default' },
          to: { type: 'string' },
          body: { type: 'string', minLength: 1 },
          title: { type: 'string' },
          footer: { type: 'string' },
          fallbackText: { type: 'string', maxLength: 65536 },
          disableFallback: { type: 'boolean', default: false },
          buttons: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: {
              type: 'object',
              required: ['text'],
              properties: {
                type: { type: 'string', enum: ['reply', 'url', 'call', 'copy'], default: 'reply' },
                id: { type: 'string' },
                text: { type: 'string', minLength: 1, maxLength: 40 },
                url: { type: 'string' },
                phone: { type: 'string' },
                value: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request) => ({
    data: await manager.sendButtons({
      sessionId: request.body.sessionId || 'default',
      to: request.body.to,
      body: request.body.body,
      title: request.body.title,
      footer: request.body.footer,
      fallbackText: request.body.fallbackText,
      disableFallback: request.body.disableFallback,
      buttons: request.body.buttons
    })
  }));

  app.post<{
    Body: {
      sessionId?: string;
      to: string;
      body: string;
      title?: string;
      footer?: string;
      buttonText: string;
      sections: InteractiveListSection[];
      fallbackText?: string;
      disableFallback?: boolean;
    };
  }>('/v1/messages/list', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Messages', 'Interactive'],
      summary: 'Send an interactive single-select list (experimental on Baileys)',
      body: {
        type: 'object',
        required: ['to', 'body', 'buttonText', 'sections'],
        properties: {
          sessionId: { type: 'string', default: 'default' },
          to: { type: 'string' },
          body: { type: 'string', minLength: 1 },
          title: { type: 'string' },
          footer: { type: 'string' },
          buttonText: { type: 'string', minLength: 1, maxLength: 30 },
          fallbackText: { type: 'string', maxLength: 65536 },
          disableFallback: { type: 'boolean', default: false },
          sections: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: {
              type: 'object',
              required: ['title', 'rows'],
              properties: {
                title: { type: 'string' },
                rows: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 10,
                  items: {
                    type: 'object',
                    required: ['id', 'title'],
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      description: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request) => ({
    data: await manager.sendList({
      sessionId: request.body.sessionId || 'default',
      to: request.body.to,
      body: request.body.body,
      title: request.body.title,
      footer: request.body.footer,
      buttonText: request.body.buttonText,
      sections: request.body.sections,
      fallbackText: request.body.fallbackText,
      disableFallback: request.body.disableFallback
    })
  }));

  app.post<{
    Body: {
      sessionId?: string;
      to: string;
      question: string;
      options: string[];
      selectableCount?: number;
    };
  }>('/v1/messages/poll', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Messages', 'Interactive'],
      summary: 'Send a poll',
      body: {
        type: 'object',
        required: ['to', 'question', 'options'],
        properties: {
          sessionId: { type: 'string', default: 'default' },
          to: { type: 'string' },
          question: { type: 'string', minLength: 1 },
          options: { type: 'array', minItems: 2, maxItems: 12, items: { type: 'string', minLength: 1 } },
          selectableCount: { type: 'integer', minimum: 1, maximum: 12, default: 1 }
        }
      }
    }
  }, async (request) => ({
    data: await manager.sendPoll({
      sessionId: request.body.sessionId || 'default',
      to: request.body.to,
      question: request.body.question,
      options: request.body.options,
      selectableCount: request.body.selectableCount
    })
  }));
}
