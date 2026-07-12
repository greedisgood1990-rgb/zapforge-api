import type { FastifyInstance } from 'fastify';
import type { SessionManager } from '../core/sessionManager.js';
import type { GroupParticipantAction, GroupUpdateInput } from '../core/types.js';

export async function groupRoutes(app: FastifyInstance, manager: SessionManager): Promise<void> {
  app.get<{ Params: { sessionId: string } }>('/v1/sessions/:sessionId/groups', {
    preHandler: app.verifyApiKey,
    schema: { tags: ['Groups'], summary: 'List groups for a connected session' }
  }, async (request) => ({
    data: await manager.listGroups(request.params.sessionId)
  }));

  app.post<{
    Params: { sessionId: string };
    Body: { subject: string; participants: string[] };
  }>('/v1/sessions/:sessionId/groups', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Groups'],
      summary: 'Create a group',
      body: {
        type: 'object',
        required: ['subject', 'participants'],
        properties: {
          subject: { type: 'string', minLength: 1, maxLength: 100 },
          participants: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string' } }
        }
      }
    }
  }, async (request) => ({
    data: await manager.createGroup(request.params.sessionId, request.body.subject, request.body.participants)
  }));

  app.post<{
    Params: { sessionId: string };
    Body: { code: string };
  }>('/v1/sessions/:sessionId/groups/invite/accept', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Groups'],
      summary: 'Join a group using an invite code or URL',
      body: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string', minLength: 5 } }
      }
    }
  }, async (request) => ({
    data: { groupId: await manager.acceptGroupInvite(request.params.sessionId, request.body.code) }
  }));

  app.get<{ Params: { sessionId: string; groupId: string } }>('/v1/sessions/:sessionId/groups/:groupId', {
    preHandler: app.verifyApiKey,
    schema: { tags: ['Groups'], summary: 'Read group metadata and participants' }
  }, async (request) => ({
    data: await manager.getGroup(request.params.sessionId, request.params.groupId)
  }));

  app.patch<{
    Params: { sessionId: string; groupId: string };
    Body: GroupUpdateInput;
  }>('/v1/sessions/:sessionId/groups/:groupId', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Groups'],
      summary: 'Update group subject, description or settings',
      body: {
        type: 'object',
        properties: {
          subject: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 2048 },
          settings: {
            type: 'object',
            properties: {
              announce: { type: 'boolean', description: 'true = only admins can send messages' },
              locked: { type: 'boolean', description: 'true = only admins can edit group info' },
              ephemeralDuration: { type: 'integer', minimum: 0 },
              memberAddMode: { type: 'string', enum: ['admin_add', 'all_member_add'] },
              joinApprovalMode: { type: 'boolean' }
            }
          }
        }
      }
    }
  }, async (request) => ({
    data: await manager.updateGroup(request.params.sessionId, request.params.groupId, request.body)
  }));

  app.post<{
    Params: { sessionId: string; groupId: string };
    Body: { participants: string[]; action: 'add' | 'remove' };
  }>('/v1/sessions/:sessionId/groups/:groupId/participants', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Groups'],
      summary: 'Add or remove group participants',
      body: {
        type: 'object',
        required: ['participants', 'action'],
        properties: {
          participants: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string' } },
          action: { type: 'string', enum: ['add', 'remove'] }
        }
      }
    }
  }, async (request) => ({
    data: await manager.updateGroupParticipants(
      request.params.sessionId,
      request.params.groupId,
      request.body.participants,
      request.body.action
    )
  }));

  app.post<{
    Params: { sessionId: string; groupId: string };
    Body: { participants: string[]; action: 'promote' | 'demote' };
  }>('/v1/sessions/:sessionId/groups/:groupId/admins', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Groups'],
      summary: 'Promote or demote group administrators',
      body: {
        type: 'object',
        required: ['participants', 'action'],
        properties: {
          participants: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string' } },
          action: { type: 'string', enum: ['promote', 'demote'] }
        }
      }
    }
  }, async (request) => ({
    data: await manager.updateGroupParticipants(
      request.params.sessionId,
      request.params.groupId,
      request.body.participants,
      request.body.action as GroupParticipantAction
    )
  }));

  app.get<{ Params: { sessionId: string; groupId: string } }>('/v1/sessions/:sessionId/groups/:groupId/join-requests', {
    preHandler: app.verifyApiKey,
    schema: { tags: ['Groups'], summary: 'List pending group join requests' }
  }, async (request) => ({
    data: await manager.listGroupJoinRequests(request.params.sessionId, request.params.groupId)
  }));

  app.post<{
    Params: { sessionId: string; groupId: string };
    Body: { participants: string[]; action: 'approve' | 'reject' };
  }>('/v1/sessions/:sessionId/groups/:groupId/join-requests', {
    preHandler: app.verifyApiKey,
    schema: {
      tags: ['Groups'],
      summary: 'Approve or reject pending group join requests',
      body: {
        type: 'object',
        required: ['participants', 'action'],
        properties: {
          participants: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string' } },
          action: { type: 'string', enum: ['approve', 'reject'] }
        }
      }
    }
  }, async (request) => ({
    data: await manager.updateGroupJoinRequests(
      request.params.sessionId,
      request.params.groupId,
      request.body.participants,
      request.body.action
    )
  }));

  app.get<{ Params: { sessionId: string; groupId: string } }>('/v1/sessions/:sessionId/groups/:groupId/invite', {
    preHandler: app.verifyApiKey,
    schema: { tags: ['Groups'], summary: 'Get the current group invite code' }
  }, async (request) => {
    const code = await manager.getGroupInviteCode(request.params.sessionId, request.params.groupId);
    return { data: { code, url: `https://chat.whatsapp.com/${code}` } };
  });

  app.post<{ Params: { sessionId: string; groupId: string } }>('/v1/sessions/:sessionId/groups/:groupId/invite/reset', {
    preHandler: app.verifyApiKey,
    schema: { tags: ['Groups'], summary: 'Revoke the old invite and generate a new code' }
  }, async (request) => {
    const code = await manager.revokeGroupInviteCode(request.params.sessionId, request.params.groupId);
    return { data: { code, url: `https://chat.whatsapp.com/${code}` } };
  });

  app.post<{ Params: { sessionId: string; groupId: string } }>('/v1/sessions/:sessionId/groups/:groupId/leave', {
    preHandler: app.verifyApiKey,
    schema: { tags: ['Groups'], summary: 'Leave a group' }
  }, async (request) => {
    await manager.leaveGroup(request.params.sessionId, request.params.groupId);
    return { ok: true };
  });
}
