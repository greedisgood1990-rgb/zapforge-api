import path from 'node:path';
import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type { MessagingEngine } from '../base.js';
import type {
  IncomingMessageEvent,
  OutgoingMediaMessage,
  OutgoingTextMessage,
  SentMessageResult,
  SessionSnapshot
} from '../../core/types.js';
import { nowIso } from '../../utils/time.js';
import { normalizeJid } from '../../utils/jid.js';
import { detectMessageType, extractMessageText } from '../../utils/message.js';

export interface BaileysEngineOptions {
  id: string;
  sessionDir: string;
  browserName: string;
  initial?: Partial<SessionSnapshot>;
}

export class BaileysEngine implements MessagingEngine {
  private emitter = new EventEmitter();
  private socket: any;
  private session: SessionSnapshot;
  private options: BaileysEngineOptions;

  constructor(options: BaileysEngineOptions) {
    const now = nowIso();
    this.options = options;
    this.session = {
      id: options.id,
      engine: 'baileys',
      state: 'created',
      qr: null,
      phone: null,
      name: null,
      createdAt: options.initial?.createdAt || now,
      updatedAt: now,
      metadata: options.initial?.metadata || {}
    };
  }

  async start(): Promise<SessionSnapshot> {
    const baileys: any = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default || baileys.makeWASocket;
    const useMultiFileAuthState = baileys.useMultiFileAuthState;
    const fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    const Browsers = baileys.Browsers;

    this.update({ state: 'connecting' });

    const authPath = path.join(this.options.sessionDir, this.options.id);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: Browsers?.ubuntu ? Browsers.ubuntu(this.options.browserName) : undefined,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true
    });

    this.socket.ev.on('creds.update', saveCreds);

    this.socket.ev.on('connection.update', (update: any) => {
      if (update.qr) this.update({ state: 'qr', qr: update.qr });

      if (update.connection === 'open') {
        const me = this.socket?.user || {};
        this.update({
          state: 'connected',
          qr: null,
          phone: me?.id || null,
          name: me?.name || me?.verifiedName || null,
          lastSeenAt: nowIso()
        });
      }

      if (update.connection === 'close') {
        const statusCode = update?.lastDisconnect?.error?.output?.statusCode;
        const loggedOutCode = baileys.DisconnectReason?.loggedOut;
        const loggedOut = loggedOutCode && statusCode === loggedOutCode;
        this.update({ state: loggedOut ? 'logged_out' : 'disconnected', qr: loggedOut ? null : this.session.qr });
      }
    });

    this.socket.ev.on('messages.upsert', (upsert: any) => {
      for (const message of upsert.messages || []) {
        const event: IncomingMessageEvent = {
          id: message?.key?.id || nanoid(),
          sessionId: this.session.id,
          from: message?.key?.remoteJid || 'unknown',
          fromMe: Boolean(message?.key?.fromMe),
          pushName: message?.pushName,
          type: detectMessageType(message),
          text: extractMessageText(message),
          timestamp: new Date(Number(message?.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
          raw: message
        };
        this.emitter.emit('message.received', event);
      }
    });

    return this.snapshot();
  }

  async stop(): Promise<void> {
    if (this.socket?.end) this.socket.end(undefined);
    this.socket = undefined;
    this.update({ state: 'disconnected', qr: null });
  }

  async logout(): Promise<void> {
    if (this.socket?.logout) await this.socket.logout();
    this.socket = undefined;
    this.update({ state: 'logged_out', qr: null });
  }

  snapshot(): SessionSnapshot {
    return structuredClone(this.session);
  }

  async sendText(input: OutgoingTextMessage): Promise<SentMessageResult> {
    this.assertConnected();
    const to = normalizeJid(input.to);

    if (input.typingTimeMs && input.typingTimeMs > 0) {
      await this.socket.sendPresenceUpdate('composing', to);
      await new Promise((resolve) => setTimeout(resolve, Math.min(input.typingTimeMs || 0, 10_000)));
      await this.socket.sendPresenceUpdate('paused', to);
    }

    const raw = await this.socket.sendMessage(to, {
      text: input.body,
      linkPreview: !input.noLinkPreview
    });

    const result: SentMessageResult = {
      id: raw?.key?.id || nanoid(),
      sessionId: this.session.id,
      to,
      status: 'sent',
      timestamp: nowIso(),
      raw
    };

    this.emitter.emit('message.sent', result);
    return result;
  }

  async sendMedia(input: OutgoingMediaMessage): Promise<SentMessageResult> {
    this.assertConnected();
    const to = normalizeJid(input.to);
    const media = await this.resolveMedia(input);
    const payload: Record<string, unknown> = {
      caption: input.caption,
      mimetype: input.mimetype,
      fileName: input.filename
    };

    if (input.type === 'image') payload.image = media;
    if (input.type === 'video') payload.video = media;
    if (input.type === 'audio') payload.audio = media;
    if (input.type === 'document') payload.document = media;
    if (input.type === 'sticker') payload.sticker = media;

    const raw = await this.socket.sendMessage(to, payload);
    const result: SentMessageResult = {
      id: raw?.key?.id || nanoid(),
      sessionId: this.session.id,
      to,
      status: 'sent',
      timestamp: nowIso(),
      raw
    };

    this.emitter.emit('message.sent', result);
    return result;
  }

  async listGroups(): Promise<unknown[]> {
    this.assertConnected();
    const groups = await this.socket.groupFetchAllParticipating();
    return Object.values(groups || {});
  }

  async getGroup(id: string): Promise<unknown> {
    this.assertConnected();
    return this.socket.groupMetadata(normalizeGroupJid(id));
  }

  addListener(event: 'session.updated' | 'message.received' | 'message.sent', handler: (payload: any) => void | Promise<void>): void {
    this.emitter.on(event, handler);
  }

  private async resolveMedia(input: OutgoingMediaMessage): Promise<Buffer | { url: string }> {
    if (input.url) return { url: input.url };
    if (input.base64) return Buffer.from(input.base64, 'base64');
    throw new Error('Media requires url or base64.');
  }

  private assertConnected(): void {
    if (!this.socket || this.session.state !== 'connected') {
      throw new Error(`Session ${this.session.id} is not connected.`);
    }
  }

  private update(patch: Partial<SessionSnapshot>): void {
    this.session = { ...this.session, ...patch, updatedAt: nowIso() };
    this.emitter.emit('session.updated', this.snapshot());
  }
}

function normalizeGroupJid(input: string): string {
  if (input.endsWith('@g.us')) return input;
  return `${input.replace(/[^0-9-]/g, '')}@g.us`;
}
