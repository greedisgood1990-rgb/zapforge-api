import fs from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type { MessagingEngine } from '../base.js';
import type {
  EngineCapabilities,
  GroupParticipantAction,
  GroupUpdateInput,
  IncomingMessageEvent,
  InteractiveButton,
  OutgoingButtonsMessage,
  OutgoingGroupMentionMessage,
  OutgoingListMessage,
  OutgoingMediaMessage,
  OutgoingPollMessage,
  OutgoingTextMessage,
  PairingCodeResult,
  SentMessageResult,
  SessionSnapshot
} from '../../core/types.js';
import { nowIso } from '../../utils/time.js';
import { normalizeJid } from '../../utils/jid.js';
import { detectMessageType, extractInteraction, extractMessageText } from '../../utils/message.js';
import { safeSessionPath } from '../../utils/sessionId.js';
import { ApiError, conflict, tooManyRequests } from '../../core/errors.js';

export interface BaileysEngineOptions {
  id: string;
  sessionDir: string;
  browserName: string;
  maxMentionParticipants: number;
  pairingCodeCooldownMs: number;
  pairingCodeWindowMs: number;
  pairingCodeMaxAttempts: number;
  pairingCodeLockoutMs: number;
  pairingCodeStabilizationMs: number;
  pairingCodeReadyTimeoutMs: number;
  pairingCodeTtlMs: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  reconnectMaxAttempts: number;
  reconnectJitterMs: number;
  interactiveMessageFallback: boolean;
  interactiveMaxButtons: number;
  interactiveMaxListRows: number;
  messageRetryCacheMax: number;
  initial?: Partial<SessionSnapshot>;
}

type EngineEvent =
  | 'session.updated'
  | 'message.received'
  | 'message.sent'
  | 'message.interaction'
  | 'group.updated'
  | 'group.participants.updated';

export class BaileysEngine implements MessagingEngine {
  private emitter = new EventEmitter();
  private socket: any;
  private baileys: any;
  private session: SessionSnapshot;
  private options: BaileysEngineOptions;
  private readonly authPath: string;
  private startPromise?: Promise<SessionSnapshot>;
  private intentionalClose = false;
  private connectionGeneration = 0;
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private registered = false;
  private socketCreatedAt = 0;
  private pairingAttempts: number[] = [];
  private pairingLockedUntil = 0;
  private lastPairingAt = 0;
  private pairingInFlight?: Promise<PairingCodeResult>;
  private pairingPhoneInFlight?: string;
  private lastPairingResult?: PairingCodeResult;
  private pairingModeActive = false;
  private pairingExpiryTimer?: ReturnType<typeof setTimeout>;
  private readonly messageCache = new Map<string, { message: unknown; storedAt: number }>();

  constructor(options: BaileysEngineOptions) {
    const now = nowIso();
    this.options = options;
    this.authPath = safeSessionPath(options.sessionDir, options.id);
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

    const persistedPolicy = readPersistedPairingPolicy(this.session.metadata);
    const nowMs = Date.now();
    this.pairingAttempts = persistedPolicy.attempts.filter(
      (attemptAt) => nowMs - attemptAt < this.options.pairingCodeWindowMs
    );
    this.pairingLockedUntil = persistedPolicy.lockedUntil;
    this.lastPairingAt = persistedPolicy.lastAttemptAt;
  }

  async start(): Promise<SessionSnapshot> {
    if (this.startPromise) return this.startPromise;
    if (this.socket && ['connecting', 'qr', 'pairing', 'connected'].includes(this.session.state)) {
      return this.snapshot();
    }

    this.intentionalClose = false;
    this.startPromise = this.connectSocket().finally(() => {
      this.startPromise = undefined;
    });
    return this.startPromise;
  }

  private async connectSocket(): Promise<SessionSnapshot> {
    this.cancelReconnect();
    this.update({ state: 'connecting', qr: null });

    const baileys: any = await import('@whiskeysockets/baileys');
    this.baileys = baileys;
    const makeWASocket = baileys.default || baileys.makeWASocket;
    const useMultiFileAuthState = baileys.useMultiFileAuthState;
    const fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    const Browsers = baileys.Browsers;
    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
    this.registered = Boolean(state?.creds?.registered);
    this.update({
      metadata: {
        ...this.session.metadata,
        registered: this.registered
      }
    });

    const logger = createSilentBaileysLogger();
    if (typeof baileys.makeCacheableSignalKeyStore === 'function') {
      state.keys = baileys.makeCacheableSignalKeyStore(state.keys, logger);
    }

    let version: unknown;
    try {
      version = (await fetchLatestBaileysVersion())?.version;
    } catch {
      version = undefined;
    }

    this.teardownSocket();
    const generation = ++this.connectionGeneration;
    const socket = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      printQRInTerminal: false,
      // Pairing-code registration is more reliable when the companion identifies as a Chrome Web client.
      // This matches the browser tuple used by OpenWA's Baileys adapter.
      browser: [this.options.browserName, 'Chrome', '120.0.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 1_000,
      getMessage: async (key: any) => {
        if (!key?.id) return undefined;
        return this.messageCache.get(key.id)?.message;
      },
      logger
    });

    this.socket = socket;
    this.socketCreatedAt = Date.now();

    socket.ev.on('creds.update', () => {
      this.registered = Boolean(state?.creds?.registered);
      this.update({
        metadata: {
          ...this.session.metadata,
          registered: this.registered
        }
      });
      void saveCreds().catch((error: unknown) => {
        this.update({
          metadata: {
            ...this.session.metadata,
            credentialSaveFailedAt: nowIso(),
            credentialSaveFailure: error instanceof Error ? error.message : String(error)
          }
        });
      });
    });

    socket.ev.on('connection.update', (update: any) => {
      void this.handleConnectionUpdate(update, generation).catch((error: unknown) => {
        if (generation !== this.connectionGeneration) return;
        this.update({
          state: 'failed',
          qr: null,
          metadata: {
            ...this.session.metadata,
            connectionFailureAt: nowIso(),
            connectionFailure: error instanceof Error ? error.message : String(error)
          }
        });
      });
    });

    socket.ev.on('messages.upsert', (upsert: any) => {
      if (generation !== this.connectionGeneration) return;
      for (const message of upsert.messages || []) {
        this.rememberMessage(message);
        const interaction = extractInteraction(message);
        const event: IncomingMessageEvent = {
          id: message?.key?.id || nanoid(),
          sessionId: this.session.id,
          from: message?.key?.remoteJid || 'unknown',
          fromMe: Boolean(message?.key?.fromMe),
          pushName: message?.pushName,
          type: detectMessageType(message),
          text: extractMessageText(message),
          interaction,
          timestamp: new Date(Number(message?.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
          raw: message
        };
        this.emitter.emit('message.received', event);
        if (interaction && !event.fromMe) this.emitter.emit('message.interaction', event);
      }
    });

    socket.ev.on('groups.update', (updates: any[]) => {
      if (generation !== this.connectionGeneration) return;
      for (const update of updates || []) {
        this.emitter.emit('group.updated', {
          sessionId: this.session.id,
          ...update,
          timestamp: nowIso()
        });
      }
    });

    socket.ev.on('group-participants.update', (update: any) => {
      if (generation !== this.connectionGeneration) return;
      this.emitter.emit('group.participants.updated', {
        sessionId: this.session.id,
        ...update,
        timestamp: nowIso()
      });
    });

    return this.snapshot();
  }

  private async handleConnectionUpdate(update: any, generation: number): Promise<void> {
    if (generation !== this.connectionGeneration) return;
    const { connection, qr, lastDisconnect } = update || {};

    if (qr && !this.pairingModeActive && qr !== this.session.qr) {
      this.update({
        state: 'qr',
        qr,
        metadata: {
          ...this.session.metadata,
          connectionMode: 'qr',
          qrUpdatedAt: nowIso()
        }
      });
    }

    if (connection === 'connecting' && this.session.state !== 'pairing') {
      this.update({ state: 'connecting' });
    }

    if (connection === 'open') {
      this.cancelReconnect();
      this.reconnectAttempts = 0;
      this.registered = true;
      this.lastPairingResult = undefined;
      this.pairingModeActive = false;
      this.cancelPairingExpiry();
      this.resetPairingPolicy();
      const me = this.socket?.user || {};
      const metadata = { ...this.session.metadata };
      delete metadata.pairingPolicy;
      this.update({
        state: 'connected',
        qr: null,
        phone: me?.id || null,
        name: me?.name || me?.verifiedName || null,
        lastSeenAt: nowIso(),
        metadata: {
          ...metadata,
          registered: true,
          connectedAt: nowIso(),
          reconnectAttempt: 0
        }
      });
      return;
    }

    if (connection !== 'close') return;

    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const loggedOutCode = this.baileys?.DisconnectReason?.loggedOut;
    const restartRequiredCode = this.baileys?.DisconnectReason?.restartRequired;
    const loggedOut = loggedOutCode !== undefined && statusCode === loggedOutCode;
    const restartRequired = restartRequiredCode !== undefined && statusCode === restartRequiredCode;

    this.detachSocketListeners(this.socket);
    this.socket = undefined;

    if (this.intentionalClose) {
      this.update({ state: 'disconnected', qr: null });
      return;
    }

    if (loggedOut) {
      this.registered = false;
      this.pairingModeActive = false;
      this.cancelPairingExpiry();
      this.resetPairingPolicy();
      const metadata = { ...this.session.metadata };
      delete metadata.pairingPolicy;
      this.update({
        state: 'logged_out',
        qr: null,
        metadata: {
          ...metadata,
          registered: false,
          disconnectedAt: nowIso(),
          disconnectReason: 'logged_out'
        }
      });
      await this.clearAuthState();
      return;
    }

    // WhatsApp closes the first socket with restartRequired after a successful QR or pairing-code link.
    // Reconnect even if creds.update has not yet flipped the local registered flag.
    if (restartRequired) {
      this.pairingModeActive = false;
      this.cancelPairingExpiry();
      this.scheduleReconnect(statusCode, true);
      return;
    }

    // An unregistered socket closing must not start a QR/pairing loop. The caller can start it again explicitly.
    if (!this.registered) {
      this.update({
        state: 'disconnected',
        qr: null,
        metadata: {
          ...this.session.metadata,
          registered: false,
          disconnectReason: 'unregistered_connection_closed',
          disconnectedAt: nowIso()
        }
      });
      return;
    }

    this.scheduleReconnect(statusCode);
  }

  private scheduleReconnect(statusCode?: number, allowUnregistered = false): void {
    if (this.reconnectTimer || this.intentionalClose) return;
    if (!this.registered && !allowUnregistered) return;
    if (this.reconnectAttempts >= this.options.reconnectMaxAttempts) {
      this.update({
        state: 'failed',
        qr: null,
        metadata: {
          ...this.session.metadata,
          reconnectAttempt: this.reconnectAttempts,
          disconnectStatusCode: statusCode ?? null,
          failureReason: 'reconnect_attempts_exhausted'
        }
      });
      return;
    }

    this.reconnectAttempts += 1;
    const exponential = this.options.reconnectBaseDelayMs * 2 ** (this.reconnectAttempts - 1);
    const delay = Math.min(this.options.reconnectMaxDelayMs, exponential)
      + (this.options.reconnectJitterMs > 0 ? randomInt(0, this.options.reconnectJitterMs + 1) : 0);
    const reconnectAt = new Date(Date.now() + delay).toISOString();

    this.update({
      state: 'disconnected',
      qr: null,
      metadata: {
        ...this.session.metadata,
        reconnectAttempt: this.reconnectAttempts,
        reconnectAt,
        disconnectStatusCode: statusCode ?? null
      }
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.intentionalClose) return;
      void this.connectSocket().catch((error) => {
        this.update({
          state: 'failed',
          metadata: {
            ...this.session.metadata,
            failureReason: error instanceof Error ? error.message : String(error)
          }
        });
      });
    }, delay);
  }

  async stop(): Promise<void> {
    this.intentionalClose = true;
    this.cancelReconnect();
    this.cancelPairingExpiry();
    this.pairingModeActive = false;
    this.lastPairingResult = undefined;
    this.teardownSocket();
    this.update({ state: 'disconnected', qr: null });
  }

  async logout(): Promise<void> {
    this.intentionalClose = true;
    this.cancelReconnect();
    try {
      if (this.socket?.logout) await this.socket.logout();
    } catch {
      this.teardownSocket();
    }
    this.socket = undefined;
    this.registered = false;
    this.lastPairingResult = undefined;
    this.pairingModeActive = false;
    this.cancelPairingExpiry();
    this.resetPairingPolicy();
    await this.clearAuthState();
    const metadata = { ...this.session.metadata };
    delete metadata.pairingPolicy;
    this.update({
      state: 'logged_out',
      qr: null,
      phone: null,
      name: null,
      metadata: {
        ...metadata,
        registered: false,
        disconnectedAt: nowIso(),
        disconnectReason: 'logout_requested'
      }
    });
  }

  snapshot(): SessionSnapshot {
    return structuredClone(this.session);
  }

  async requestPairingCode(phoneNumber: string): Promise<PairingCodeResult> {
    const phone = normalizePairingPhoneNumber(phoneNumber);
    const now = Date.now();

    if (this.session.state === 'connected' || this.registered) {
      throw conflict('This session is already linked. Logout before requesting a new pairing code.', 'session_already_linked');
    }
    if (!this.socket || typeof this.socket.requestPairingCode !== 'function') {
      throw conflict('Start the session before requesting a pairing code.', 'session_not_initialized');
    }

    if (
      this.lastPairingResult
      && this.lastPairingResult.phoneNumber === phone
      && now < Date.parse(this.lastPairingResult.expiresAt)
    ) {
      return { ...this.lastPairingResult, reused: true };
    }

    if (this.pairingInFlight) {
      if (this.pairingPhoneInFlight === phone) return this.pairingInFlight;
      throw conflict('Another pairing-code request is already running for this session.', 'pairing_request_in_progress');
    }

    if (now < this.pairingLockedUntil) {
      this.persistPairingPolicy();
      const retryAfter = Math.ceil((this.pairingLockedUntil - now) / 1000);
      throw tooManyRequests(
        'Pairing requests are temporarily locked for this session.',
        retryAfter,
        'pairing_locked',
        { lockedUntil: new Date(this.pairingLockedUntil).toISOString() }
      );
    }

    this.pairingAttempts = this.pairingAttempts.filter(
      (attemptAt) => now - attemptAt < this.options.pairingCodeWindowMs
    );
    if (this.pairingAttempts.length >= this.options.pairingCodeMaxAttempts) {
      this.pairingLockedUntil = now + this.options.pairingCodeLockoutMs;
      this.persistPairingPolicy();
      const retryAfter = Math.ceil(this.options.pairingCodeLockoutMs / 1000);
      throw tooManyRequests(
        'Pairing attempt limit reached for this session.',
        retryAfter,
        'pairing_attempt_limit',
        { lockedUntil: new Date(this.pairingLockedUntil).toISOString() }
      );
    }

    const nextAllowedAtMs = this.lastPairingAt + this.options.pairingCodeCooldownMs;
    if (this.lastPairingAt > 0 && now < nextAllowedAtMs) {
      throw tooManyRequests(
        'Wait before requesting another pairing code.',
        Math.ceil((nextAllowedAtMs - now) / 1000),
        'pairing_cooldown',
        { nextAllowedAt: new Date(nextAllowedAtMs).toISOString() }
      );
    }

    this.lastPairingAt = now;
    this.pairingAttempts.push(now);
    this.persistPairingPolicy();
    this.pairingPhoneInFlight = phone;
    this.pairingInFlight = this.generatePairingCode(phone).finally(() => {
      this.pairingInFlight = undefined;
      this.pairingPhoneInFlight = undefined;
    });
    return this.pairingInFlight;
  }

  private async waitForPairingTransport(): Promise<void> {
    const deadline = Date.now() + this.options.pairingCodeReadyTimeoutMs;

    while (Date.now() < deadline) {
      if (this.session.state === 'connected' || this.registered) {
        throw conflict('This session is already linked. Logout before requesting a new pairing code.', 'session_already_linked');
      }
      if (!this.socket || typeof this.socket.requestPairingCode !== 'function') {
        throw conflict('The session stopped before the pairing transport became ready.', 'session_not_initialized');
      }

      const transport = this.socket?.ws;
      const transportOpen = transport?.isOpen === true || transport?.readyState === 1;
      const registrationReady = Boolean(this.session.qr) || this.session.state === 'qr';
      if (transportOpen || registrationReady) return;

      if (['failed', 'logged_out', 'disconnected'].includes(this.session.state)) {
        throw conflict(
          `Session ${this.session.id} entered state ${this.session.state} before pairing became ready.`,
          'pairing_transport_closed'
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new ApiError(
      'The WhatsApp registration transport did not become ready in time. Check network egress and try again without restarting the session repeatedly.',
      504,
      'pairing_transport_timeout',
      {
        sessionId: this.session.id,
        state: this.session.state,
        timeoutMs: this.options.pairingCodeReadyTimeoutMs
      }
    );
  }

  private async generatePairingCode(phone: string): Promise<PairingCodeResult> {
    await this.waitForPairingTransport();
    const previousQr = this.session.qr || null;
    const elapsed = Date.now() - this.socketCreatedAt;
    const stabilizationDelay = Math.max(0, this.options.pairingCodeStabilizationMs - elapsed);
    if (stabilizationDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, stabilizationDelay));
    }
    if (!this.socket || typeof this.socket.requestPairingCode !== 'function') {
      throw conflict('The session stopped before the pairing code could be generated.', 'session_not_initialized');
    }

    this.pairingModeActive = true;
    this.update({
      state: 'pairing',
      qr: null,
      metadata: {
        ...this.session.metadata,
        connectionMode: 'pairing_code',
        pairingRequestedAt: nowIso(),
        pairingPhoneSuffix: maskPhoneNumber(phone)
      }
    });

    try {
      const rawCode = await this.socket.requestPairingCode(phone);
      const code = String(rawCode || '').replace(/\s+/g, '');
      if (!code) throw new Error('The provider returned an empty pairing code.');

      const generatedAtMs = Date.now();
      const result: PairingCodeResult = {
        sessionId: this.session.id,
        phoneNumber: phone,
        maskedPhoneNumber: maskPhoneNumber(phone),
        code,
        formattedCode: formatPairingCode(code),
        generatedAt: new Date(generatedAtMs).toISOString(),
        expiresAt: new Date(generatedAtMs + this.options.pairingCodeTtlMs).toISOString(),
        nextAllowedAt: new Date(this.lastPairingAt + this.options.pairingCodeCooldownMs).toISOString(),
        reused: false
      };
      this.lastPairingResult = result;
      this.cancelPairingExpiry();
      this.pairingExpiryTimer = setTimeout(() => {
        this.pairingExpiryTimer = undefined;
        if (this.session.state === 'connected') return;
        this.lastPairingResult = undefined;
        this.pairingModeActive = false;
        this.update({
          state: this.socket ? 'connecting' : 'disconnected',
          metadata: {
            ...this.session.metadata,
            pairingExpiredAt: nowIso()
          }
        });
      }, this.options.pairingCodeTtlMs);
      return result;
    } catch (error) {
      this.pairingModeActive = false;
      const providerStatusCode = extractProviderStatusCode(error);
      const failureMessage = error instanceof Error ? error.message : String(error);
      this.update({
        state: previousQr ? 'qr' : 'connecting',
        qr: previousQr,
        metadata: {
          ...this.session.metadata,
          pairingFailedAt: nowIso(),
          pairingFailure: failureMessage,
          pairingFailureStatusCode: providerStatusCode ?? null
        }
      });
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        `Pairing code generation failed: ${failureMessage}`,
        502,
        'pairing_provider_error',
        {
          providerStatusCode: providerStatusCode ?? null,
          sessionState: this.session.state,
          qrAvailable: Boolean(previousQr)
        }
      );
    }
  }

  private cancelPairingExpiry(): void {
    if (!this.pairingExpiryTimer) return;
    clearTimeout(this.pairingExpiryTimer);
    this.pairingExpiryTimer = undefined;
  }

  private cancelReconnect(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private detachSocketListeners(socket: any): void {
    if (!socket) return;
    socket.ev?.removeAllListeners?.('connection.update');
    socket.ev?.removeAllListeners?.('creds.update');
    socket.ev?.removeAllListeners?.('messages.upsert');
    socket.ev?.removeAllListeners?.('groups.update');
    socket.ev?.removeAllListeners?.('group-participants.update');
  }

  private teardownSocket(): void {
    const socket = this.socket;
    this.socket = undefined;
    if (!socket) return;
    try {
      this.detachSocketListeners(socket);
      socket.end?.(undefined);
    } catch {
      // Socket teardown is best-effort; a closed WebSocket may throw during end().
    }
  }

  private async clearAuthState(): Promise<void> {
    await fs.rm(this.authPath, { recursive: true, force: true });
  }

  capabilities(): EngineCapabilities {
    return {
      provider: 'baileys',
      capabilities: {
        'messages.text': true,
        'messages.media': true,
        'messages.groupMention': true,
        'messages.replyButtons': 'experimental',
        'messages.urlButtons': 'experimental',
        'messages.callButtons': 'experimental',
        'messages.copyButtons': 'experimental',
        'messages.lists': 'experimental',
        'messages.polls': true,
        'sessions.qr': true,
        'sessions.pairingCode': true,
        'groups.read': true,
        'groups.create': true,
        'groups.update': true,
        'groups.participants': true,
        'groups.admins': true,
        'groups.invites': true,
        'groups.joinRequests': true,
        'groups.memberAddMode': true
      },
      notes: {
        'sessions.pairingCode': 'Pairing requests are serialized, cached for their local TTL and protected by cooldown and lockout limits.',
        'messages.replyButtons': 'Baileys native-flow delivery depends on the current WhatsApp Web protocol. Text fallback is enabled by default.',
        'messages.urlButtons': 'CTA buttons use native-flow messages and fall back to readable text when relay fails.'
      }
    };
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

    return this.sentResult(to, raw);
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
    return this.sentResult(to, raw);
  }

  async sendGroupMention(input: OutgoingGroupMentionMessage): Promise<SentMessageResult> {
    this.assertConnected();
    const groupId = normalizeGroupJid(input.groupId);
    const metadata = await this.socket.groupMetadata(groupId);
    const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
    const includeAdmins = input.includeAdmins !== false;
    type MentionMember = { sendJid: string; displayJid: string; aliases: string[] };
    const members: MentionMember[] = participants
      .filter((participant: any) => includeAdmins || !participant.admin)
      .map((participant: any) => ({
        sendJid: participant.id || participant.jid || participant.lid,
        displayJid: participant.jid || participant.id || participant.lid,
        aliases: [participant.id, participant.jid, participant.lid].filter(
          (jid: unknown): jid is string => typeof jid === 'string' && jid.length > 0
        )
      }))
      .filter((member: Partial<MentionMember>): member is MentionMember => Boolean(member.sendJid && member.displayJid));

    let selected: MentionMember[];
    if (input.mentionAll !== false) {
      selected = members;
    } else {
      selected = (input.mentions || []).flatMap((value) => {
        const normalized = normalizeJid(value);
        const member = members.find((candidate) => candidate.aliases.includes(normalized));
        return member ? [member] : [];
      });
    }
    selected = Array.from(new Map(selected.map((member) => [member.sendJid, member])).values());
    const mentions = selected.map((member) => member.sendJid);

    if (!mentions.length) throw new Error('No valid group participants were selected for mention.');
    if (mentions.length > this.options.maxMentionParticipants) {
      throw new Error(`Mention limit exceeded. Maximum: ${this.options.maxMentionParticipants}.`);
    }

    const mentionText = selected.map((member) => `@${member.displayJid.split('@')[0]}`).join(' ');
    const text = input.appendMentions === false ? input.body : `${input.body}\n\n${mentionText}`;
    if (text.length > 65536) throw new Error('Message is too long after appending mentions.');
    const raw = await this.socket.sendMessage(groupId, { text, mentions });
    const result = this.sentResult(groupId, raw);
    result.mentionedCount = mentions.length;
    return result;
  }

  async sendButtons(input: OutgoingButtonsMessage): Promise<SentMessageResult> {
    if (!input.buttons.length) throw new ApiError('At least one button is required.', 400, 'invalid_buttons');
    if (input.buttons.length > this.options.interactiveMaxButtons) {
      throw new ApiError(
        `Button limit exceeded. Maximum: ${this.options.interactiveMaxButtons}.`,
        400,
        'button_limit_exceeded'
      );
    }
    const ids = input.buttons
      .filter((button) => (button.type || 'reply') === 'reply')
      .map((button) => button.id)
      .filter((id): id is string => Boolean(id));
    if (new Set(ids).size !== ids.length) {
      throw new ApiError('Reply button ids must be unique.', 400, 'duplicate_button_id');
    }

    const buttons = input.buttons.map((button) => this.nativeButton(button));
    try {
      const result = await this.sendNativeFlow(input.to, input.body, input.title, input.footer, buttons);
      result.deliveryMode = 'native_flow';
      return result;
    } catch (error) {
      if (input.disableFallback || !this.options.interactiveMessageFallback) throw error;
      const fallbackText = input.fallbackText || buildButtonFallbackText(input);
      const result = await this.sendText({ sessionId: input.sessionId, to: input.to, body: fallbackText });
      result.deliveryMode = 'text_fallback';
      result.warnings = [
        `Native-flow relay failed; a text fallback was sent instead: ${error instanceof Error ? error.message : String(error)}`
      ];
      return result;
    }
  }

  async sendList(input: OutgoingListMessage): Promise<SentMessageResult> {
    const rows = input.sections.flatMap((section) => section.rows);
    if (!rows.length) throw new ApiError('At least one list row is required.', 400, 'invalid_list');
    if (rows.length > this.options.interactiveMaxListRows) {
      throw new ApiError(
        `List row limit exceeded. Maximum: ${this.options.interactiveMaxListRows}.`,
        400,
        'list_row_limit_exceeded'
      );
    }
    const rowIds = rows.map((row) => row.id);
    if (rowIds.some((id) => !id?.trim()) || new Set(rowIds).size !== rowIds.length) {
      throw new ApiError('List row ids must be non-empty and unique.', 400, 'invalid_list_row_id');
    }

    const sections = input.sections.map((section) => ({
      title: section.title,
      rows: section.rows.map((row) => ({
        id: row.id,
        header: row.title,
        title: row.title,
        description: row.description || ''
      }))
    }));

    try {
      const result = await this.sendNativeFlow(input.to, input.body, input.title, input.footer, [{
        name: 'single_select',
        buttonParamsJson: JSON.stringify({ title: input.buttonText, sections })
      }]);
      result.deliveryMode = 'native_flow';
      return result;
    } catch (error) {
      if (input.disableFallback || !this.options.interactiveMessageFallback) throw error;
      const fallbackText = input.fallbackText || buildListFallbackText(input);
      const result = await this.sendText({ sessionId: input.sessionId, to: input.to, body: fallbackText });
      result.deliveryMode = 'text_fallback';
      result.warnings = [
        `Native-flow list relay failed; a text fallback was sent instead: ${error instanceof Error ? error.message : String(error)}`
      ];
      return result;
    }
  }

  async sendPoll(input: OutgoingPollMessage): Promise<SentMessageResult> {
    this.assertConnected();
    const to = normalizeJid(input.to);
    const selectableCount = Math.max(1, Math.min(input.selectableCount || 1, input.options.length));
    const raw = await this.socket.sendMessage(to, {
      poll: {
        name: input.question,
        values: input.options,
        selectableCount
      }
    });
    return this.sentResult(to, raw);
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

  async createGroup(subject: string, participants: string[]): Promise<unknown> {
    this.assertConnected();
    return this.socket.groupCreate(subject, participants.map((participant) => normalizeJid(participant)));
  }

  async updateGroup(id: string, input: GroupUpdateInput): Promise<unknown> {
    this.assertConnected();
    const groupId = normalizeGroupJid(id);
    if (input.subject !== undefined) await this.socket.groupUpdateSubject(groupId, input.subject);
    if (input.description !== undefined) await this.socket.groupUpdateDescription(groupId, input.description);
    if (input.settings?.announce !== undefined) {
      await this.socket.groupSettingUpdate(groupId, input.settings.announce ? 'announcement' : 'not_announcement');
    }
    if (input.settings?.locked !== undefined) {
      await this.socket.groupSettingUpdate(groupId, input.settings.locked ? 'locked' : 'unlocked');
    }
    if (input.settings?.ephemeralDuration !== undefined) {
      if (typeof this.socket.groupToggleEphemeral !== 'function') {
        throw new Error('Ephemeral group messages are not supported by the installed Baileys version.');
      }
      await this.socket.groupToggleEphemeral(groupId, input.settings.ephemeralDuration);
    }
    if (input.settings?.memberAddMode !== undefined) {
      if (typeof this.socket.groupMemberAddMode !== 'function') {
        throw new Error('Group member add mode is not supported by the installed Baileys version.');
      }
      await this.socket.groupMemberAddMode(groupId, input.settings.memberAddMode);
    }
    if (input.settings?.joinApprovalMode !== undefined) {
      if (typeof this.socket.groupJoinApprovalMode !== 'function') {
        throw new Error('Group join approval mode is not supported by the installed Baileys version.');
      }
      await this.socket.groupJoinApprovalMode(groupId, input.settings.joinApprovalMode ? 'on' : 'off');
    }
    return this.socket.groupMetadata(groupId);
  }

  async updateGroupParticipants(id: string, participants: string[], action: GroupParticipantAction): Promise<unknown> {
    this.assertConnected();
    return this.socket.groupParticipantsUpdate(
      normalizeGroupJid(id),
      participants.map((participant) => normalizeJid(participant)),
      action
    );
  }

  async listGroupJoinRequests(id: string): Promise<unknown[]> {
    this.assertConnected();
    if (typeof this.socket.groupRequestParticipantsList !== 'function') {
      throw new Error('Group join requests are not supported by the installed Baileys version.');
    }
    return this.socket.groupRequestParticipantsList(normalizeGroupJid(id));
  }

  async updateGroupJoinRequests(id: string, participants: string[], action: 'approve' | 'reject'): Promise<unknown> {
    this.assertConnected();
    if (typeof this.socket.groupRequestParticipantsUpdate !== 'function') {
      throw new Error('Group join requests are not supported by the installed Baileys version.');
    }
    return this.socket.groupRequestParticipantsUpdate(
      normalizeGroupJid(id),
      participants.map((participant) => normalizeJid(participant)),
      action
    );
  }

  async getGroupInviteCode(id: string): Promise<string> {
    this.assertConnected();
    const code = await this.socket.groupInviteCode(normalizeGroupJid(id));
    if (!code) throw new Error('The provider did not return a group invite code.');
    return code;
  }

  async revokeGroupInviteCode(id: string): Promise<string> {
    this.assertConnected();
    const code = await this.socket.groupRevokeInvite(normalizeGroupJid(id));
    if (!code) throw new Error('The provider did not return a new group invite code.');
    return code;
  }

  async acceptGroupInvite(code: string): Promise<string> {
    this.assertConnected();
    const cleanCode = code.replace(/^https?:\/\/chat\.whatsapp\.com\//i, '').trim();
    const groupId = await this.socket.groupAcceptInvite(cleanCode);
    if (!groupId) throw new Error('The group invitation could not be accepted.');
    return groupId;
  }

  async leaveGroup(id: string): Promise<void> {
    this.assertConnected();
    await this.socket.groupLeave(normalizeGroupJid(id));
  }

  addListener(event: EngineEvent, handler: (payload: any) => void | Promise<void>): void {
    this.emitter.on(event, handler);
  }

  private nativeButton(button: InteractiveButton): { name: string; buttonParamsJson: string } {
    const type = button.type || 'reply';
    const text = String(button.text || '').trim();
    if (!text) throw new ApiError('Button text is required.', 400, 'invalid_button_text');

    if (type === 'reply') {
      const id = String(button.id || '').trim();
      if (!id || id.length > 256) {
        throw new ApiError('Reply button id must contain 1 to 256 characters.', 400, 'invalid_button_id');
      }
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: text, id })
      };
    }
    if (type === 'url') {
      const url = normalizeInteractiveUrl(button.url);
      return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({ display_text: text, url, merchant_url: url })
      };
    }
    if (type === 'call') {
      const phone = normalizeCallButtonPhone(button.phone);
      return {
        name: 'cta_call',
        buttonParamsJson: JSON.stringify({ display_text: text, phone_number: phone })
      };
    }

    const value = String(button.value || '').trim();
    if (!value || value.length > 1024) {
      throw new ApiError('Copy button value must contain 1 to 1024 characters.', 400, 'invalid_copy_value');
    }
    return {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({ display_text: text, copy_code: value })
    };
  }

  private async sendNativeFlow(
    recipient: string,
    body: string,
    title: string | undefined,
    footer: string | undefined,
    buttons: Array<{ name: string; buttonParamsJson: string }>
  ): Promise<SentMessageResult> {
    this.assertConnected();
    const to = normalizeJid(recipient);
    const proto = this.baileys?.proto;
    const generateWAMessageFromContent = this.baileys?.generateWAMessageFromContent;
    if (!proto || !generateWAMessageFromContent || typeof this.socket.relayMessage !== 'function') {
      throw new Error('Interactive native-flow messages are not supported by the installed Baileys version.');
    }

    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: body }),
      footer: footer ? proto.Message.InteractiveMessage.Footer.create({ text: footer }) : undefined,
      header: title
        ? proto.Message.InteractiveMessage.Header.create({ title, hasMediaAttachment: false })
        : undefined,
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons, messageParamsJson: '{}' })
    });

    const generated = generateWAMessageFromContent(to, {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage
        }
      }
    }, { userJid: this.socket?.user?.id });

    if (!generated?.message || !generated?.key?.id) {
      throw new Error('Baileys did not generate a valid interactive message envelope.');
    }
    await this.socket.relayMessage(to, generated.message, { messageId: generated.key.id });
    return this.sentResult(to, generated);
  }

  private sentResult(to: string, raw: any): SentMessageResult {
    this.rememberMessage(raw);
    const result: SentMessageResult = {
      id: raw?.key?.id || nanoid(),
      sessionId: this.session.id,
      to,
      status: 'sent',
      timestamp: nowIso(),
      deliveryMode: 'standard',
      raw
    };
    this.emitter.emit('message.sent', result);
    return result;
  }

  private rememberMessage(raw: any): void {
    const id = raw?.key?.id;
    const message = raw?.message;
    if (!id || !message) return;

    this.messageCache.delete(id);
    this.messageCache.set(id, { message, storedAt: Date.now() });
    while (this.messageCache.size > this.options.messageRetryCacheMax) {
      const oldest = this.messageCache.keys().next().value;
      if (!oldest) break;
      this.messageCache.delete(oldest);
    }
  }

  private persistPairingPolicy(): void {
    this.update({
      metadata: {
        ...this.session.metadata,
        pairingPolicy: {
          attempts: this.pairingAttempts,
          lockedUntil: this.pairingLockedUntil,
          lastAttemptAt: this.lastPairingAt
        }
      }
    });
  }

  private resetPairingPolicy(): void {
    this.pairingAttempts = [];
    this.pairingLockedUntil = 0;
    this.lastPairingAt = 0;
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

function createSilentBaileysLogger(): any {
  const noop = (): void => undefined;
  const logger: any = {
    level: 'silent',
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop
  };
  logger.child = () => logger;
  return logger;
}

function extractProviderStatusCode(error: unknown): number | undefined {
  const candidate = error as { output?: { statusCode?: unknown }; statusCode?: unknown; data?: { statusCode?: unknown } };
  const values = [candidate?.output?.statusCode, candidate?.statusCode, candidate?.data?.statusCode];
  return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function normalizePairingPhoneNumber(input: string): string {
  const phone = String(input || '').replace(/\D/g, '');
  if (phone.length < 8 || phone.length > 15) {
    throw new ApiError(
      'phoneNumber must contain 8 to 15 digits, including the country code and without +, spaces or punctuation.',
      400,
      'invalid_phone_number'
    );
  }
  return phone;
}

function maskPhoneNumber(phone: string): string {
  if (phone.length <= 4) return '*'.repeat(phone.length);
  return `${'*'.repeat(Math.max(4, phone.length - 4))}${phone.slice(-4)}`;
}

function formatPairingCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') || code;
}

function normalizeInteractiveUrl(input: string | undefined): string {
  const value = String(input || '').trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError('URL button requires a valid absolute URL.', 400, 'invalid_button_url');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ApiError('URL button only supports http and https.', 400, 'invalid_button_url');
  }
  return url.toString();
}

function normalizeCallButtonPhone(input: string | undefined): string {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new ApiError('Call button phone must contain 8 to 15 digits including country code.', 400, 'invalid_button_phone');
  }
  return `+${digits}`;
}

function buildButtonFallbackText(input: OutgoingButtonsMessage): string {
  const lines = input.buttons.map((button, index) => {
    const type = button.type || 'reply';
    if (type === 'url') return `${index + 1}. ${button.text}: ${button.url}`;
    if (type === 'call') return `${index + 1}. ${button.text}: ${button.phone}`;
    if (type === 'copy') return `${index + 1}. ${button.text}: ${button.value}`;
    return `${index + 1}. ${button.text} [${button.id}]`;
  });
  return [input.title, input.body, '', ...lines, input.footer].filter(Boolean).join('\n');
}

function buildListFallbackText(input: OutgoingListMessage): string {
  const rows = input.sections.flatMap((section) =>
    section.rows.map((row) => `${row.title}${row.description ? ` — ${row.description}` : ''} [${row.id}]`)
  );
  return [input.title, input.body, '', ...rows, input.footer].filter(Boolean).join('\n');
}

function readPersistedPairingPolicy(metadata: Record<string, unknown> | undefined): {
  attempts: number[];
  lockedUntil: number;
  lastAttemptAt: number;
} {
  const raw = metadata?.pairingPolicy;
  if (!raw || typeof raw !== 'object') return { attempts: [], lockedUntil: 0, lastAttemptAt: 0 };
  const policy = raw as Record<string, unknown>;
  const attempts = Array.isArray(policy.attempts)
    ? policy.attempts.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : [];
  return {
    attempts,
    lockedUntil: typeof policy.lockedUntil === 'number' && Number.isFinite(policy.lockedUntil) ? policy.lockedUntil : 0,
    lastAttemptAt: typeof policy.lastAttemptAt === 'number' && Number.isFinite(policy.lastAttemptAt) ? policy.lastAttemptAt : 0
  };
}

function normalizeGroupJid(input: string): string {
  if (input.endsWith('@g.us')) return input;
  const clean = input.replace(/[^0-9-]/g, '');
  if (!clean) throw new Error('Invalid group id.');
  return `${clean}@g.us`;
}
