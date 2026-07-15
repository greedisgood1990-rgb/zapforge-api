from pathlib import Path
import json

ROOT = Path.cwd()

def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}\n--- old ---\n{old[:500]}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")

def append_once(path: str, marker: str, addition: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    if addition.strip() in text:
        return
    if marker not in text:
        raise RuntimeError(f"{path}: marker not found")
    file.write_text(text.replace(marker, marker + addition, 1), encoding="utf-8")

# config
replace_once(
    "src/config.ts",
    """  INTERACTIVE_MESSAGE_FALLBACK: z.coerce.boolean().default(true),
  INTERACTIVE_MAX_BUTTONS: z.coerce.number().int().min(1).max(10).default(3)
""",
    """  INTERACTIVE_MESSAGE_FALLBACK: z.coerce.boolean().default(true),
  INTERACTIVE_MAX_BUTTONS: z.coerce.number().int().min(1).max(10).default(3),
  INTERACTIVE_MAX_LIST_ROWS: z.coerce.number().int().min(1).max(100).default(10),
  MESSAGE_RETRY_CACHE_MAX: z.coerce.number().int().min(50).max(10_000).default(500)
"""
)

# types
replace_once(
    "src/core/types.ts",
    """  buttonText: string;
  sections: InteractiveListSection[];
}
""",
    """  buttonText: string;
  sections: InteractiveListSection[];
  fallbackText?: string;
  disableFallback?: boolean;
}
"""
)

# session manager init
replace_once(
    "src/core/sessionManager.ts",
    """  async init(): Promise<void> {
    await fs.mkdir(this.config.SESSION_DIR, { recursive: true });

    for (const session of this.store.allSessions()) {
      if (session.state === 'connected' || session.state === 'qr' || session.state === 'pairing' || session.state === 'connecting' || session.state === 'disconnected') {
        await this.start(session.id, session.engine, true);
      }
    }
  }
""",
    """  async init(): Promise<void> {
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
"""
)

# session manager start
replace_once(
    "src/core/sessionManager.ts",
    """  async start(id: string, engine: EngineName = 'baileys', restore = false): Promise<SessionSnapshot> {
    assertValidSessionId(id);
    if (this.engines.has(id)) return this.engines.get(id)!.start();

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
""",
    """  async start(id: string, engine: EngineName = 'baileys', restore = false): Promise<SessionSnapshot> {
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
"""
)

# add restore helper
replace_once(
    "src/core/sessionManager.ts",
    """  private createEngine(engine: EngineName, snapshot: SessionSnapshot): MessagingEngine {
""",
    """  private shouldRestoreSession(session: SessionSnapshot): boolean {
    const linked = Boolean(session.phone) || session.metadata?.registered === true;
    return linked && ['connected', 'connecting', 'disconnected'].includes(session.state);
  }

  private createEngine(engine: EngineName, snapshot: SessionSnapshot): MessagingEngine {
"""
)

# engine options in manager
replace_once(
    "src/core/sessionManager.ts",
    """        interactiveMessageFallback: this.config.INTERACTIVE_MESSAGE_FALLBACK,
        interactiveMaxButtons: this.config.INTERACTIVE_MAX_BUTTONS,
        initial: snapshot
""",
    """        interactiveMessageFallback: this.config.INTERACTIVE_MESSAGE_FALLBACK,
        interactiveMaxButtons: this.config.INTERACTIVE_MAX_BUTTONS,
        interactiveMaxListRows: this.config.INTERACTIVE_MAX_LIST_ROWS,
        messageRetryCacheMax: this.config.MESSAGE_RETRY_CACHE_MAX,
        initial: snapshot
"""
)

# safe session update listener
replace_once(
    "src/core/sessionManager.ts",
    """    engine.addListener('session.updated', async (snapshot) => {
      await this.store.saveSession(snapshot);
      this.bus.emitGateway('session.updated', snapshot, snapshot.id);
    });
""",
    """    engine.addListener('session.updated', (snapshot) => {
      void this.store.saveSession(snapshot)
        .then(() => this.bus.emitGateway('session.updated', snapshot, snapshot.id))
        .catch((error) => {
          console.error('[session.persist.failed]', {
            sessionId: snapshot.id,
            error: error instanceof Error ? error.message : String(error)
          });
        });
    });
"""
)

# Baileys options
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """  interactiveMessageFallback: boolean;
  interactiveMaxButtons: number;
  initial?: Partial<SessionSnapshot>;
""",
    """  interactiveMessageFallback: boolean;
  interactiveMaxButtons: number;
  interactiveMaxListRows: number;
  messageRetryCacheMax: number;
  initial?: Partial<SessionSnapshot>;
"""
)

# Baileys fields
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """  private pairingModeActive = false;
  private pairingExpiryTimer?: ReturnType<typeof setTimeout>;
""",
    """  private pairingModeActive = false;
  private pairingExpiryTimer?: ReturnType<typeof setTimeout>;
  private readonly messageCache = new Map<string, { message: unknown; storedAt: number }>();
"""
)

# hydrate pairing policy
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """      metadata: options.initial?.metadata || {}
    };
  }

  async start(): Promise<SessionSnapshot> {
""",
    """      metadata: options.initial?.metadata || {}
    };

    const persistedPolicy = readPersistedPairingPolicy(this.session.metadata);
    const now = Date.now();
    this.pairingAttempts = persistedPolicy.attempts.filter(
      (attemptAt) => now - attemptAt < this.options.pairingCodeWindowMs
    );
    this.pairingLockedUntil = persistedPolicy.lockedUntil;
    this.lastPairingAt = persistedPolicy.lastAttemptAt;
  }

  async start(): Promise<SessionSnapshot> {
"""
)

# persist registered flag after auth load
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
    this.registered = Boolean(state?.creds?.registered);

    const logger = createSilentBaileysLogger();
""",
    """    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
    this.registered = Boolean(state?.creds?.registered);
    this.update({
      metadata: {
        ...this.session.metadata,
        registered: this.registered
      }
    });

    const logger = createSilentBaileysLogger();
"""
)

# add getMessage callback
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 1_000,
      logger
""",
    """      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 1_000,
      getMessage: async (key: any) => {
        if (!key?.id) return undefined;
        return this.messageCache.get(key.id)?.message;
      },
      logger
"""
)

# safe creds and connection listeners
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """    socket.ev.on('creds.update', async () => {
      this.registered = Boolean(state?.creds?.registered);
      await saveCreds();
    });

    socket.ev.on('connection.update', (update: any) => {
      void this.handleConnectionUpdate(update, generation);
    });
""",
    """    socket.ev.on('creds.update', () => {
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
"""
)

# cache incoming messages
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """      for (const message of upsert.messages || []) {
        const interaction = extractInteraction(message);
""",
    """      for (const message of upsert.messages || []) {
        this.rememberMessage(message);
        const interaction = extractInteraction(message);
"""
)

# connection open and close logic
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """    if (connection === 'open') {
      this.cancelReconnect();
      this.reconnectAttempts = 0;
      this.registered = true;
      this.lastPairingResult = undefined;
      this.pairingModeActive = false;
      this.cancelPairingExpiry();
      const me = this.socket?.user || {};
      this.update({
        state: 'connected',
        qr: null,
        phone: me?.id || null,
        name: me?.name || me?.verifiedName || null,
        lastSeenAt: nowIso(),
        metadata: {
          ...this.session.metadata,
          connectedAt: nowIso(),
          reconnectAttempt: 0
        }
      });
      return;
    }

    if (connection !== 'close') return;

    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const loggedOutCode = this.baileys?.DisconnectReason?.loggedOut;
    const loggedOut = loggedOutCode !== undefined && statusCode === loggedOutCode;

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
      this.update({ state: 'logged_out', qr: null });
      await this.clearAuthState();
      return;
    }

    // An unregistered socket closing must not start a QR/pairing loop. The caller can start it again explicitly.
    if (!this.registered) {
      this.update({
        state: 'disconnected',
        qr: null,
        metadata: {
          ...this.session.metadata,
          disconnectReason: 'unregistered_connection_closed',
          disconnectedAt: nowIso()
        }
      });
      return;
    }

    this.scheduleReconnect(statusCode);
  }

  private scheduleReconnect(statusCode?: number): void {
    if (this.reconnectTimer || this.intentionalClose) return;
""",
    """    if (connection === 'open') {
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
"""
)

# stop/logout cleanup
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """  async stop(): Promise<void> {
    this.intentionalClose = true;
    this.cancelReconnect();
    this.cancelPairingExpiry();
    this.pairingModeActive = false;
    this.teardownSocket();
    this.update({ state: 'disconnected', qr: null });
  }
""",
    """  async stop(): Promise<void> {
    this.intentionalClose = true;
    this.cancelReconnect();
    this.cancelPairingExpiry();
    this.pairingModeActive = false;
    this.lastPairingResult = undefined;
    this.teardownSocket();
    this.update({ state: 'disconnected', qr: null });
  }
"""
)

replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """    this.lastPairingResult = undefined;
    this.pairingModeActive = false;
    this.cancelPairingExpiry();
    await this.clearAuthState();
    this.update({ state: 'logged_out', qr: null, phone: null, name: null });
""",
    """    this.lastPairingResult = undefined;
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
"""
)

# pairing persistence at lock checks and attempt
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """    if (now < this.pairingLockedUntil) {
      const retryAfter = Math.ceil((this.pairingLockedUntil - now) / 1000);
      throw tooManyRequests(
""",
    """    if (now < this.pairingLockedUntil) {
      this.persistPairingPolicy();
      const retryAfter = Math.ceil((this.pairingLockedUntil - now) / 1000);
      throw tooManyRequests(
"""
)

replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """    if (this.pairingAttempts.length >= this.options.pairingCodeMaxAttempts) {
      this.pairingLockedUntil = now + this.options.pairingCodeLockoutMs;
      const retryAfter = Math.ceil(this.options.pairingCodeLockoutMs / 1000);
""",
    """    if (this.pairingAttempts.length >= this.options.pairingCodeMaxAttempts) {
      this.pairingLockedUntil = now + this.options.pairingCodeLockoutMs;
      this.persistPairingPolicy();
      const retryAfter = Math.ceil(this.options.pairingCodeLockoutMs / 1000);
"""
)

replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """    this.lastPairingAt = now;
    this.pairingAttempts.push(now);
    this.pairingPhoneInFlight = phone;
""",
    """    this.lastPairingAt = now;
    this.pairingAttempts.push(now);
    this.persistPairingPolicy();
    this.pairingPhoneInFlight = phone;
"""
)

# list fallback and validation
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """  async sendList(input: OutgoingListMessage): Promise<SentMessageResult> {
    const sections = input.sections.map((section) => ({
      title: section.title,
      rows: section.rows.map((row) => ({
        id: row.id,
        header: row.title,
        title: row.title,
        description: row.description || ''
      }))
    }));
    return this.sendNativeFlow(input.to, input.body, input.title, input.footer, [{
      name: 'single_select',
      buttonParamsJson: JSON.stringify({ title: input.buttonText, sections })
    }]);
  }
""",
    """  async sendList(input: OutgoingListMessage): Promise<SentMessageResult> {
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
"""
)

# native button validation
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """  private nativeButton(button: InteractiveButton): { name: string; buttonParamsJson: string } {
    const type = button.type || 'reply';
    if (type === 'reply') {
      if (!button.id) throw new Error('Reply button requires id.');
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: button.text, id: button.id })
      };
    }
    if (type === 'url') {
      if (!button.url) throw new Error('URL button requires url.');
      return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({ display_text: button.text, url: button.url, merchant_url: button.url })
      };
    }
    if (type === 'call') {
      if (!button.phone) throw new Error('Call button requires phone.');
      return {
        name: 'cta_call',
        buttonParamsJson: JSON.stringify({ display_text: button.text, phone_number: button.phone })
      };
    }
    if (!button.value) throw new Error('Copy button requires value.');
    return {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({ display_text: button.text, copy_code: button.value })
    };
  }
""",
    """  private nativeButton(button: InteractiveButton): { name: string; buttonParamsJson: string } {
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
"""
)

# remember outgoing and pairing helper methods before resolveMedia
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """  private sentResult(to: string, raw: any): SentMessageResult {
    const result: SentMessageResult = {
""",
    """  private sentResult(to: string, raw: any): SentMessageResult {
    this.rememberMessage(raw);
    const result: SentMessageResult = {
"""
)

replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """  private async resolveMedia(input: OutgoingMediaMessage): Promise<Buffer | { url: string }> {
""",
    """  private rememberMessage(raw: any): void {
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
"""
)

# helper functions
replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """function buildButtonFallbackText(input: OutgoingButtonsMessage): string {
""",
    """function normalizeInteractiveUrl(input: string | undefined): string {
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
"""
)

replace_once(
    "src/adapters/baileys/BaileysEngine.ts",
    """function normalizeGroupJid(input: string): string {
""",
    """function buildListFallbackText(input: OutgoingListMessage): string {
  const rows = input.sections.flatMap((section) =>
    section.rows.map((row) => `${row.title}${row.description ? ` — ${row.description}` : ''} [${row.id}]`)
  );
  return [input.title, input.body, '', ...rows, input.footer].filter(Boolean).join('\\n');
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
"""
)

# route list fallback fields
replace_once(
    "src/routes/messages.ts",
    """      buttonText: string;
      sections: InteractiveListSection[];
""",
    """      buttonText: string;
      sections: InteractiveListSection[];
      fallbackText?: string;
      disableFallback?: boolean;
"""
)

replace_once(
    "src/routes/messages.ts",
    """          buttonText: { type: 'string', minLength: 1, maxLength: 30 },
          sections: {
""",
    """          buttonText: { type: 'string', minLength: 1, maxLength: 30 },
          fallbackText: { type: 'string', maxLength: 65536 },
          disableFallback: { type: 'boolean', default: false },
          sections: {
"""
)

replace_once(
    "src/routes/messages.ts",
    """      buttonText: request.body.buttonText,
      sections: request.body.sections
""",
    """      buttonText: request.body.buttonText,
      sections: request.body.sections,
      fallbackText: request.body.fallbackText,
      disableFallback: request.body.disableFallback
"""
)

# no-store sensitive responses
replace_once(
    "src/routes/sessions.ts",
    """  }, async (request) => {
    await manager.start(request.params.id);
    return { data: await manager.requestPairingCode(request.params.id, request.body.phoneNumber) };
  });
""",
    """  }, async (request, reply) => {
    reply.header('cache-control', 'no-store');
    await manager.start(request.params.id);
    return { data: await manager.requestPairingCode(request.params.id, request.body.phoneNumber) };
  });
"""
)

replace_once(
    "src/routes/sessions.ts",
    """  app.get<{ Params: { id: string } }>('/v1/sessions/:id/qr', { preHandler: app.verifyApiKey, schema: { tags: ['Sessions'], summary: 'Get the latest QR as raw text and data URL' } }, async (request, reply) => {
    const session = manager.get(request.params.id);
""",
    """  app.get<{ Params: { id: string } }>('/v1/sessions/:id/qr', { preHandler: app.verifyApiKey, schema: { tags: ['Sessions'], summary: 'Get the latest QR as raw text and data URL' } }, async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = manager.get(request.params.id);
"""
)

# atomic serialized JSON store
(ROOT / "src/storage/jsonStore.ts").write_text("""import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { PersistedStore, SessionSnapshot, WebhookRegistration } from '../core/types.js';
import { nowIso } from '../utils/time.js';

const emptyStore: PersistedStore = {
  sessions: {},
  webhooks: {},
  audit: []
};

export class JsonStore {
  private filePath: string;
  private data: PersistedStore = structuredClone(emptyStore);
  private ready = false;
  private flushQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.data = { ...structuredClone(emptyStore), ...JSON.parse(raw) };
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
      await this.flush();
    }
    this.ready = true;
  }

  allSessions(): SessionSnapshot[] {
    this.ensureReady();
    return Object.values(this.data.sessions);
  }

  getSession(id: string): SessionSnapshot | undefined {
    this.ensureReady();
    return this.data.sessions[id];
  }

  async saveSession(session: SessionSnapshot): Promise<SessionSnapshot> {
    this.ensureReady();
    this.data.sessions[session.id] = session;
    await this.flush();
    return session;
  }

  async removeSession(id: string): Promise<void> {
    this.ensureReady();
    delete this.data.sessions[id];
    await this.flush();
  }

  allWebhooks(): WebhookRegistration[] {
    this.ensureReady();
    return Object.values(this.data.webhooks);
  }

  getWebhook(id: string): WebhookRegistration | undefined {
    this.ensureReady();
    return this.data.webhooks[id];
  }

  async saveWebhook(webhook: WebhookRegistration): Promise<WebhookRegistration> {
    this.ensureReady();
    this.data.webhooks[webhook.id] = webhook;
    await this.flush();
    return webhook;
  }

  async removeWebhook(id: string): Promise<void> {
    this.ensureReady();
    delete this.data.webhooks[id];
    await this.flush();
  }

  async audit(actor: string, action: string, details?: Record<string, unknown>): Promise<void> {
    this.ensureReady();
    this.data.audit.unshift({ id: nanoid(), actor, action, at: nowIso(), details });
    this.data.audit = this.data.audit.slice(0, 1000);
    await this.flush();
  }

  private ensureReady(): void {
    if (!this.ready) throw new Error('JsonStore not initialized. Call init() first.');
  }

  private flush(): Promise<void> {
    const payload = JSON.stringify(this.data, null, 2);
    const directory = path.dirname(this.filePath);
    const temporary = `${this.filePath}.tmp`;

    this.flushQueue = this.flushQueue
      .catch(() => undefined)
      .then(async () => {
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 });
        await fs.rename(temporary, this.filePath);
      });

    return this.flushQueue;
  }
}
""", encoding="utf-8")

# env example
replace_once(
    ".env.example",
    """INTERACTIVE_MESSAGE_FALLBACK=true
INTERACTIVE_MAX_BUTTONS=3
""",
    """INTERACTIVE_MESSAGE_FALLBACK=true
INTERACTIVE_MAX_BUTTONS=3
INTERACTIVE_MAX_LIST_ROWS=10

# Baileys retry cache (bounded, in-memory)
MESSAGE_RETRY_CACHE_MAX=500
"""
)

# version
replace_once("package.json", '"version": "1.2.0"', '"version": "1.2.1"')

# tests: append regression cases and update options
replace_once(
    "tests/connection-and-buttons.test.mjs",
    """  interactiveMessageFallback: true,
  interactiveMaxButtons: 3
""",
    """  interactiveMessageFallback: true,
  interactiveMaxButtons: 3,
  interactiveMaxListRows: 10,
  messageRetryCacheMax: 50
"""
)

append_once(
    "tests/connection-and-buttons.test.mjs",
    "  await engine.stop();\n});\n",
    """

test('persists pairing throttling metadata without storing the pairing code', async () => {
  const engine = new BaileysEngine(options);
  engine.socket = { requestPairingCode: async () => '87654321' };
  engine.socketCreatedAt = Date.now() - 10_000;

  const result = await engine.requestPairingCode('5511999999999');
  const policy = engine.snapshot().metadata.pairingPolicy;

  assert.equal(result.code, '87654321');
  assert.equal(Array.isArray(policy.attempts), true);
  assert.equal(policy.attempts.length, 1);
  assert.equal(JSON.stringify(engine.snapshot().metadata).includes('87654321'), false);
  await engine.stop();
});

test('reconnects on restartRequired even before creds.update marks the session registered', async () => {
  const engine = new BaileysEngine({ ...options, reconnectBaseDelayMs: 1, reconnectMaxDelayMs: 1 });
  engine.baileys = { DisconnectReason: { loggedOut: 401, restartRequired: 515 } };
  engine.socket = { ev: { removeAllListeners() {} } };
  engine.connectionGeneration = 7;
  let scheduled = false;
  engine.scheduleReconnect = (_status, allowUnregistered) => {
    scheduled = allowUnregistered === true;
  };

  await engine.handleConnectionUpdate(
    { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } },
    7
  );

  assert.equal(scheduled, true);
});

test('uses text fallback for lists when native-flow generation is unavailable', async () => {
  const engine = new BaileysEngine(options);
  engine.session.state = 'connected';
  let fallbackPayload;
  engine.socket = {
    user: { id: '5511000000000@s.whatsapp.net' },
    sendMessage: async (_to, payload) => {
      fallbackPayload = payload;
      return { key: { id: 'list-fallback-1' }, message: payload };
    }
  };
  engine.baileys = {};

  const result = await engine.sendList({
    sessionId: 'test-session',
    to: '5511888888888',
    body: 'Escolha:',
    buttonText: 'Abrir',
    sections: [{
      title: 'Opções',
      rows: [
        { id: 'one', title: 'Primeira' },
        { id: 'two', title: 'Segunda' }
      ]
    }]
  });

  assert.equal(result.deliveryMode, 'text_fallback');
  assert.match(fallbackPayload.text, /Primeira \\[one\\]/);
  assert.match(fallbackPayload.text, /Segunda \\[two\\]/);
  await engine.stop();
});
"""
)

# changelog
append_once(
    "CHANGELOG.md",
    "# Changelog\n",
    """
## 1.2.1 — 2026-07-15

### Fixed

- Prevented automatic restore of QR, pairing and never-linked disconnected sessions.
- Reconnected after Baileys `restartRequired`, including the event ordering where `creds.update` has not completed.
- Persisted pairing cooldown and lockout counters across process restarts without storing pairing codes.
- Serialized and atomically replaced the JSON state file.
- Prevented unhandled promise rejections while saving credentials and session snapshots.
- Added a bounded message cache for Baileys retry requests.
- Added validation and text fallback for interactive lists.
- Normalized CTA URLs and call-button phone numbers.

"""
)

# review report
(ROOT / "docs/CODE_REVIEW_1.2.1.md").write_text("""# Code review 1.2.1

## Scope

This review focused on session initialization, QR and pairing-code connection, reconnect behavior, native-flow delivery and persistence.

## Findings corrected

### Automatic restore

The server restored sessions stored as `qr`, `pairing` or `disconnected` without confirming that the account had ever been linked. A service restart could therefore create another unregistered connection and publish a new QR. Automatic restore now requires linked-session evidence (`phone` or `metadata.registered=true`) and only restores connected/connecting/disconnected linked sessions.

### Pairing restart handoff

Baileys closes the initial socket with `restartRequired` after a successful link. The previous implementation stopped when the local `registered` flag had not yet been updated by `creds.update`. The close handler now treats `restartRequired` as a controlled reconnect signal.

### Pairing throttling after restart

Cooldown, attempt counters and lockout existed only in memory. Restarting the process cleared them. The policy timestamps are now persisted in session metadata. The pairing code and full phone number are not written to metadata.

### State-file writes

Multiple session and audit events could call `writeFile` concurrently. State writes are now queued and use a temporary file followed by atomic rename.

### Baileys retry support

The socket now provides `getMessage` backed by a bounded cache. This supports message retry requests without keeping unlimited history in memory.

### Interactive delivery

Buttons now validate URL, phone, reply IDs and copy values before native-flow construction. Lists now validate total rows and unique IDs and use the same text-fallback behavior as buttons.

## Operational limits

A successful `relayMessage` only confirms acceptance by the connected provider socket. It does not guarantee that every client build will render native-flow controls. Test Android, iOS and Web after Baileys upgrades.

QR and pairing codes are credentials. Their endpoints return `Cache-Control: no-store`.
""", encoding="utf-8")

# Remove staging script after application
staging = ROOT / ".zapforge-review"
if staging.exists():
    import shutil
    shutil.rmtree(staging)

print("review fixes applied")
