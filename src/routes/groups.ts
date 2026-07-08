import type { FastifyInstance } from 'fastify';
import type { SessionManager } from '../core/sessionManager.js';

export async function groupRoutes(app: FastifyInstance, manager: SessionManager): Promise<void> {
  app.get<{ Params: { sessionId: string } }>('/v1/sessions/:sessionId/groups', {
    preHandler: app.verifyApiKey,
    schema: { tags: ['Groups'], summary: 'List groups for a connected session' }
  }, async (request) => ({
    data: await manager.listGroups(request.params.sessionId)
  }));

  app.get<{ Params: { sessionId: string; groupId: string } }>('/v1/sessions/:sessionId/groups/:groupId', {
    preHandler: app.verifyApiKey,
    schema: { tags: ['Groups'], summary: 'Read group metadata' }
  }, async (request) => ({
    data: await manager.getGroup(request.params.sessionId, request.params.groupId)
  }));
}
