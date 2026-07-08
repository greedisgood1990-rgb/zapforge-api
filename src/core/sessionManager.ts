import fs from 'node:fs/promises';
import type { MessagingEngine } from '../adapters/base.js';
import { BaileysEngine } from '../adapters/baileys/BaileysEngine.js';
import type { AppConfig } from '../config.js';
import type { EngineName, OutgoingMediaMessage, OutgoingTextMessage, SentMessageResult, SessionSnapshot } from './types.js';
import { GatewayEventBus } from './eventBus.js';
import { JsonStore } from '../storage/jsonStore.js';
import { nowIso } from '../utils/time.js';
import { PerSessionRatePolicy } from './ratePolicy.js';

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
      if (session.state === 'connected' || session.state === 'qr' || session.state === 'connecting' || session.state === 'disconnected') {
        await this.start(session.id, session.engine, true);
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

  async start(id: string, engine: EngineName = 'baileys', restore = false): Promise<SessionSnapshot> {
    if (this.engines.has(id)) return this.engines.get(id)!.snapshot();

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
    await this.store.audit('api', restore ? 'session.restore' : 'session.start', { id, engine });

    return instance.start();
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
    const engine = this.engines.get(id);
    if (engine) {
      await engine.stop().catch(() => undefined);
      this.engines.delete(id);
    }
    await this.store.removeSession(id);
    await fs.rm(`${this.config.SESSION_DIR}/${id}`, { recursive: true, force: true });
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

  async listGroups(sessionId: string): Promise<unknown[]> {
    return this.requireEngine(sessionId).listGroups();
  }

  async getGroup(sessionId: string, groupId: string): Promise<unknown> {
    return this.requireEngine(sessionId).getGroup(groupId);
  }

  private createEngine(engine: EngineName, snapshot: SessionSnapshot): MessagingEngine {
    if (engine === 'baileys') {
      return new BaileysEngine({
        id: snapshot.id,
        sessionDir: this.config.SESSION_DIR,
        browserName: this.config.APP_BROWSER_NAME,
        initial: snapshot
      });
    }

    throw new Error(`Unsupported engine: ${engine}`);
  }

  private wireEngine(engine: MessagingEngine): void {
    engine.addListener('session.updated', async (snapshot) => {
      await this.store.saveSession(snapshot);
      this.bus.emitGateway('session.updated', snapshot, snapshot.id);
    });

    engine.addListener('message.received', async (event) => {
      this.bus.emitGateway('message.received', event, event.sessionId);
    });

    engine.addListener('message.sent', async (event) => {
      this.bus.emitGateway('message.sent', event, event.sessionId);
    });
  }

  private requireEngine(id: string): MessagingEngine {
    const engine = this.engines.get(id);
    if (!engine) throw new Error(`Session ${id} is not running. Start it first.`);
    return engine;
  }
}
