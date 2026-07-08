export type EngineName = 'baileys';

export type SessionState =
  | 'created'
  | 'connecting'
  | 'qr'
  | 'connected'
  | 'disconnected'
  | 'logged_out'
  | 'failed';

export interface SessionSnapshot {
  id: string;
  engine: EngineName;
  state: SessionState;
  qr?: string | null;
  phone?: string | null;
  name?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface OutgoingTextMessage {
  sessionId: string;
  to: string;
  body: string;
  quotedMessageId?: string;
  noLinkPreview?: boolean;
  typingTimeMs?: number;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

export interface OutgoingMediaMessage {
  sessionId: string;
  to: string;
  type: MediaKind;
  url?: string;
  base64?: string;
  filename?: string;
  caption?: string;
  mimetype?: string;
}

export interface SentMessageResult {
  id: string;
  sessionId: string;
  to: string;
  status: 'queued' | 'sent';
  timestamp: string;
  raw?: unknown;
}

export interface IncomingMessageEvent {
  id: string;
  sessionId: string;
  from: string;
  fromMe: boolean;
  pushName?: string;
  type: string;
  text?: string | null;
  timestamp: string;
  raw?: unknown;
}

export interface WebhookRegistration {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedStore {
  sessions: Record<string, SessionSnapshot>;
  webhooks: Record<string, WebhookRegistration>;
  audit: Array<{
    id: string;
    actor: string;
    action: string;
    at: string;
    details?: Record<string, unknown>;
  }>;
}

export interface GatewayEvent<T = unknown> {
  id: string;
  event: string;
  timestamp: string;
  sessionId?: string;
  payload: T;
}
