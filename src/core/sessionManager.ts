import fs from 'node:fs/promises';
import type { MessagingEngine } from '../adapters/base.js';
import { BaileysEngine } from '../adapters/baileys/BaileysEngine.js';
import type { AppConfig } from '../config.js';
import type {
  EngineCapabilities,
  EngineName,
  GroupParticipantAction,
  GroupUpdateInput,
  OutgoingButtonsMessage,
  OutgoingGroupMentionMessage,
  OutgoingListMessage,
  OutgoingMediaMessage,
  OutgoingPollMessage,
  OutgoingTextMessage,
  PairingCodeResult,
  SentMessageResult,
  SessionSnapshot
} from './types.js';
import { GatewayEventBus } from './eventBus.js';
import { JsonStore } from '../storage/jsonStore.js';
import { nowIso } from '../utils/time.js';
import { PerSessionRatePolicy } from './ratePolicy.js';
import { assertValidSessionId, safeSessionPath } from '../utils/sessionId.js';

export class SessionManager {
  private engines = new Map<string, MessagingEngine>();
  private ratePolicy: PerSessionRatePolicy;

  constructor(
    private store: JsonStore,
    private bus: GatewayEventBus,
    private config: AppConfig
  ) {
    this.ratePolicy = new PerSessionRatePolicy(config.MAX_MESSAGES_PER_MINUTE_PER_SESSION);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.config.SESSION_DIR, { recursive: true });

    for (const session of this.store.allSessions()) {
      if (!this.shouldRestoreSession(session)) continue;
      try {
        await this.start(session.id, session.engine, true);
      } catch (error) {
        await this.store.audit('system', 'session.restore.failed', {
          id: session.id,
          error: error instanceof Error ? error.message : String(error)
        }).catch(() => undefined);
      }
    }
  }

  list(): SessionSnapshot[] {
    const fromEngines = Array.from(this.engines.values()).map((engine) => engine.snapshot());
    const offline = this.store.allSessions().filter((stored) => !this.engines.has(stored.id));
    return [...fromEngines, ...offline].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): SessionSnapshot | undefined {
    return this.engines.get(id)?.snapshot() || this.store.getSession(id);
  }

  capabilities(id: string): EngineCapabilities {
    return this.requireEngine(id).capabilities();
  }

  async requestPairingCode(id: string, phoneNumber: string): Promise<PairingCodeResult> {
    const result = await this.requireEngine(id).requestPairingCode(phoneNumber);
    await this.store.audit('api', 'session.pairing_code.requested', {
      id,
      phoneSuffix: result.maskedPhoneNumber,
      reused: result.reused,
      nextAllowedAt: result.nextAllowedAt
    });
    return result;
  }

  async start(id: string, engine: EngineName = 'baileys', restore = false): Promise<SessionSnapshot> {
    assertValidSessionId(id);
    const running = this.engines.get(id);
    if (running) return running.start();

    const existing = this.store.getSession(id);
    const snapshot: SessionSnapshot = existing || {
      id,
      engine,
      state: 'created',
      qr: null,
      phone: null,
      name: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      metadata: {}
    };

    const instance = this.createEngine(snapshot.engine, snapshot);
    this.wireEngine(instance);
    this.engines.set(id, instance);
    await this.store.saveSession(snapshot);
    await this.store.audit('api', restore ? 'session.restore' : 'session.start', { id, engine: snapshot.engine });

    try {
      return await instance.start();
    } catch (error) {
      this.engines.delete(id);
      await instance.stop().catch(() => undefined);
      const failed: SessionSnapshot = {
        ...instance.snapshot(),
        state: 'failed',
        qr: null,
        updatedAt: nowIso(),
        metadata: {
          ...instance.snapshot().metadata,
          startFailedAt: nowIso(),
          startFailure: error instanceof Error ? error.message : String(error)
        }
      };
      await this.store.saveSession(failed);
      await this.store.audit('api', 'session.start.failed', {
        id,
        restore,
        error: error instanceof Error ? error.message : String(error)
      }).catch(() => undefined);
      throw error;
    }
  }

  async stop(id: string): Promise<SessionSnapshot> {
    const engine = this.requireEngine(id);
    await engine.stop();
    await this.store.audit('api', 'session.stop', { id });
    return engine.snapshot();
  }

  async logout(id: string): Promise<SessionSnapshot> {
    const engine = this.requireEngine(id);
    await engine.logout();
    const snapshot = engine.snapshot();
    await this.store.audit('api', 'session.logout', { id });
    return snapshot;
  }

  async remove(id: string): Promise<void> {
    assertValidSessionId(id);
    const engine = this.engines.get(id);
    if (engine) {
      await engine.stop().catch(() => undefined);
      this.engines.delete(id);
    }
    await this.store.removeSession(id);
    await fs.rm(safeSessionPath(this.config.SESSION_DIR, id), { recursive: true, force: true });
    await this.store.audit('api', 'session.remove', { id });
  }

  async sendText(input: OutgoingTextMessage): Promise<SentMessageResult> {
    this.ratePolicy.assertAllowed(input.sessionId);
    const result = await this.requireEngine(input.sessionId).sendText(input);
    await this.store.audit('api', 'message.text.sent', { sessionId: input.sessionId, to: input.to, messageId: result.id });
    return result;
  }

  async sendMedia(input: OutgoingMediaMessage): Promise<SentMessageResult> {
    this.ratePolicy.assertAllowed(input.sessionId);
    const result = await this.requireEngine(input.sessionId).sendMedia(input);
    await this.store.audit('api', 'message.media.sent', { sessionId: input.sessionId, to: input.to, type: input.type, messageId: result.id });
    return result;
  }

  async sendGroupMention(input: OutgoingGroupMentionMessage): Promise<SentMessageResult> {
    this.ratePolicy.assertAllowed(input.sessionId);
    const result = await this.requireEngine(input.sessionId).sendGroupMention(input);
    await this.store.audit('api', 'message.group_mention.sent', {
      sessionId: input.sessionId,
      groupId: input.groupId,
      messageId: result.id,
      mentionedCount: result.mentionedCount
    });
    return result;
  }

  async sendButtons(input: OutgoingButtonsMessage): Promise<SentMessageResult> {
    this.ratePolicy.assertAllowed(input.sessionId);
    const result = await this.requireEngine(input.sessionId).sendButtons(input);
    await this.store.audit('api', 'message.buttons.sent', { sessionId: input.sessionId, to: input.to, messageId: result.id });
    return result;
  }

  async sendList(input: OutgoingListMessage): Promise<SentMessageResult> {
    this.ratePolicy.assertAllowed(input.sessionId);
    const result = await this.requireEngine(input.sessionId).sendList(input);
    await this.store.audit('api', 'message.list.sent', { sessionId: input.sessionId, to: input.to, messageId: result.id });
    return result;
  }

  async sendPoll(input: OutgoingPollMessage): Promise<SentMessageResult> {
    this.ratePolicy.assertAllowed(input.sessionId);
    const result = await this.requireEngine(input.sessionId).sendPoll(input);
    await this.store.audit('api', 'message.poll.sent', { sessionId: input.sessionId, to: input.to, messageId: result.id });
    return result;
  }

  async listGroups(sessionId: string): Promise<unknown[]> {
    return this.requireEngine(sessionId).listGroups();
  }

  async getGroup(sessionId: string, groupId: string): Promise<unknown> {
    return this.requireEngine(sessionId).getGroup(groupId);
  }

  async createGroup(sessionId: string, subject: string, participants: string[]): Promise<unknown> {
    this.assertParticipantBatch(participants);
    const result = await this.requireEngine(sessionId).createGroup(subject, participants);
    await this.store.audit('api', 'group.create', { sessionId, subject, participants: participants.length });
    return result;
  }

  async updateGroup(sessionId: string, groupId: string, input: GroupUpdateInput): Promise<unknown> {
    const result = await this.requireEngine(sessionId).updateGroup(groupId, input);
    await this.store.audit('api', 'group.update', { sessionId, groupId, fields: Object.keys(input) });
    return result;
  }

  async updateGroupParticipants(sessionId: string, groupId: string, participants: string[], action: GroupParticipantAction): Promise<unknown> {
    this.assertParticipantBatch(participants);
    const result = await this.requireEngine(sessionId).updateGroupParticipants(groupId, participants, action);
    await this.store.audit('api', `group.participants.${action}`, { sessionId, groupId, participants: participants.length });
    return result;
  }

  async listGroupJoinRequests(sessionId: string, groupId: string): Promise<unknown[]> {
    return this.requireEngine(sessionId).listGroupJoinRequests(groupId);
  }

  async updateGroupJoinRequests(
    sessionId: string,
    groupId: string,
    participants: string[],
    action: 'approve' | 'reject'
  ): Promise<unknown> {
    this.assertParticipantBatch(participants);
    const result = await this.requireEngine(sessionId).updateGroupJoinRequests(groupId, participants, action);
    await this.store.audit('api', `group.join_requests.${action}`, { sessionId, groupId, participants: participants.length });
    return result;
  }

  async getGroupInviteCode(sessionId: string, groupId: string): Promise<string> {
    return this.requireEngine(sessionId).getGroupInviteCode(groupId);
  }

  async revokeGroupInviteCode(sessionId: string, groupId: string): Promise<string> {
    const code = await this.requireEngine(sessionId).revokeGroupInviteCode(groupId);
    await this.store.audit('api', 'group.invite.revoke', { sessionId, groupId });
    return code;
  }

  async acceptGroupInvite(sessionId: string, code: string): Promise<string> {
    const groupId = await this.requireEngine(sessionId).acceptGroupInvite(code);
    await this.store.audit('api', 'group.invite.accept', { sessionId, groupId });
    return groupId;
  }

  async leaveGroup(sessionId: string, groupId: string): Promise<void> {
    await this.requireEngine(sessionId).leaveGroup(groupId);
    await this.store.audit('api', 'group.leave', { sessionId, groupId });
  }

  private assertParticipantBatch(participants: string[]): void {
    if (!participants.length) throw new Error('At least one participant is required.');
    if (participants.length > this.config.GROUP_PARTICIPANT_BATCH_MAX) {
      throw new Error(`Participant batch limit exceeded. Maximum: ${this.config.GROUP_PARTICIPANT_BATCH_MAX}.`);
    }
  }

  private shouldRestoreSession(session: SessionSnapshot): boolean {
    const linked = Boolean(session.phone) || session.metadata?.registered === true;
    return linked && ['connected', 'connecting', 'disconnected'].includes(session.state);
  }

  private createEngine(engine: EngineName, snapshot: SessionSnapshot): MessagingEngine {
    if (engine === 'baileys') {
      return new BaileysEngine({
        id: snapshot.id,
        sessionDir: this.config.SESSION_DIR,
        browserName: this.config.APP_BROWSER_NAME,
        maxMentionParticipants: this.config.GROUP_MENTION_MAX_PARTICIPANTS,
        pairingCodeCooldownMs: this.config.PAIRING_CODE_COOLDOWN_MS,
        pairingCodeWindowMs: this.config.PAIRING_CODE_WINDOW_MS,
        pairingCodeMaxAttempts: this.config.PAIRING_CODE_MAX_ATTEMPTS,
        pairingCodeLockoutMs: this.config.PAIRING_CODE_LOCKOUT_MS,
        pairingCodeStabilizationMs: this.config.PAIRING_CODE_STABILIZATION_MS,
        pairingCodeReadyTimeoutMs: this.config.PAIRING_CODE_READY_TIMEOUT_MS,
        pairingCodeTtlMs: this.config.PAIRING_CODE_TTL_MS,
        reconnectBaseDelayMs: this.config.RECONNECT_BASE_DELAY_MS,
        reconnectMaxDelayMs: this.config.RECONNECT_MAX_DELAY_MS,
        reconnectMaxAttempts: this.config.RECONNECT_MAX_ATTEMPTS,
        reconnectJitterMs: this.config.RECONNECT_JITTER_MS,
        interactiveMessageFallback: this.config.INTERACTIVE_MESSAGE_FALLBACK,
        interactiveMaxButtons: this.config.INTERACTIVE_MAX_BUTTONS,
        interactiveMaxListRows: this.config.INTERACTIVE_MAX_LIST_ROWS,
        messageRetryCacheMax: this.config.MESSAGE_RETRY_CACHE_MAX,
        initial: snapshot
      });
    }

    throw new Error(`Unsupported engine: ${engine}`);
  }

  private wireEngine(engine: MessagingEngine): void {
    engine.addListener('session.updated', (snapshot) => {
      void this.store.saveSession(snapshot)
        .then(() => this.bus.emitGateway('session.updated', snapshot, snapshot.id))
        .catch((error) => {
          console.error('[session.persist.failed]', {
            sessionId: snapshot.id,
            error: error instanceof Error ? error.message : String(error)
          });
        });
    });

    engine.addListener('message.received', async (event) => {
      this.bus.emitGateway('message.received', event, event.sessionId);
    });

    engine.addListener('message.sent', async (event) => {
      this.bus.emitGateway('message.sent', event, event.sessionId);
    });

    engine.addListener('message.interaction', async (event) => {
      this.bus.emitGateway('message.interaction', event, event.sessionId);
    });

    engine.addListener('group.updated', async (event: any) => {
      this.bus.emitGateway('group.updated', event, event?.sessionId);
    });

    engine.addListener('group.participants.updated', async (event: any) => {
      this.bus.emitGateway('group.participants.updated', event, event?.sessionId);
    });
  }

  private requireEngine(id: string): MessagingEngine {
    assertValidSessionId(id);
    const engine = this.engines.get(id);
    if (!engine) throw new Error(`Session ${id} is not running. Start it first.`);
    return engine;
  }
}
